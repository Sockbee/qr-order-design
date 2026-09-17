package com.caucse.qrorder.domain;

import com.caucse.qrorder.api.ApiEnvelope;
import com.caucse.qrorder.api.ApiException;
import com.caucse.qrorder.auth.StaffPrincipal;
import com.caucse.qrorder.sse.DomainEventService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.OffsetDateTime;
import java.util.*;

/** Quantity-level fulfilment; order_items remain the financial source of truth. */
@Service
public class PreparationService {
    private final JdbcTemplate jdbc;
    private final TableVisitService visits;
    private final DomainEventService events;
    public PreparationService(JdbcTemplate jdbc, TableVisitService visits, DomainEventService events) {
        this.jdbc=jdbc; this.visits=visits; this.events=events;
    }

    public void initialize(UUID orderId) {
        jdbc.update("""
            INSERT INTO order_preparation_units(order_item_id,unit_no,status,batch_id,ready_at,served_at)
            SELECT i.order_item_id,n,i.preparation_status,
              CASE WHEN i.preparation_status IN ('READY','SERVED') THEN i.order_id END,i.prepared_at,i.served_at
            FROM order_items i CROSS JOIN LATERAL generate_series(1,i.quantity) n
            WHERE i.order_id=? ON CONFLICT(order_item_id,unit_no) DO NOTHING
            """,orderId);
    }

    public boolean locked(UUID itemId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM order_preparation_units u JOIN order_items i USING(order_item_id)
              WHERE i.order_item_id=? AND (u.status='SERVED' OR (i.preparation_station='KITCHEN' AND u.status<>'PENDING')))
            """,Boolean.class,itemId));
    }

    public void resize(UUID itemId) {
        jdbc.update("DELETE FROM order_preparation_units u USING order_items i WHERE u.order_item_id=i.order_item_id AND i.order_item_id=? AND u.unit_no>i.quantity",itemId);
        initialize(jdbc.queryForObject("SELECT order_id FROM order_items WHERE order_item_id=?",UUID.class,itemId));
    }

    /** Bridge retained table-wide and legacy line APIs into the unit model. */
    public void syncLine(UUID itemId, UUID batchId) {
        jdbc.update("""
            UPDATE order_preparation_units u SET status=i.preparation_status,
              batch_id=CASE WHEN i.preparation_status IN ('READY','SERVED') THEN COALESCE(u.batch_id,?) END,
              ready_at=i.prepared_at,served_at=i.served_at,
              started_at=CASE WHEN i.preparation_status='PENDING' THEN NULL ELSE u.started_at END
            FROM order_items i WHERE i.order_item_id=u.order_item_id AND i.order_item_id=?
            """,batchId,itemId);
    }

    public void syncOrder(UUID orderId, String action) {
        if ("COOKING".equals(action) || "RECEIVED".equals(action)) {
            jdbc.update("""
                UPDATE order_preparation_units u SET status=?,started_at=CASE WHEN ?='COOKING' THEN now() END
                FROM order_items i WHERE i.order_item_id=u.order_item_id AND i.order_id=?
                AND i.status='ACTIVE' AND i.preparation_station='KITCHEN' AND u.status IN ('PENDING','COOKING')
                ""","COOKING".equals(action)?"COOKING":"PENDING",action,orderId);
        } else {
            UUID batchId=UUID.randomUUID();
            if ("READY".equals(action)) jdbc.update("""
                UPDATE order_preparation_units u SET status='READY',batch_id=COALESCE(batch_id,?),ready_at=COALESCE(ready_at,now())
                FROM order_items i WHERE i.order_item_id=u.order_item_id AND i.order_id=? AND i.status='ACTIVE' AND u.status<>'SERVED'
                """,batchId,orderId);
            else jdbc.update("""
                UPDATE order_preparation_units u SET status='SERVED',batch_id=COALESCE(batch_id,?),ready_at=COALESCE(ready_at,now()),served_at=now()
                FROM order_items i WHERE i.order_item_id=u.order_item_id AND i.order_id=? AND i.status='ACTIVE'
                  AND (u.status='READY' OR ?='FORCE_SERVED')
                """,batchId,orderId,action);
            recalculate(orderId);
        }
    }

    @Transactional
    public Void transition(String orderIdValue, List<String> unitIdValues, String action, StaffPrincipal staff) {
        visits.lock();
        if(unitIdValues==null || unitIdValues.isEmpty() || unitIdValues.size()>1000 || new HashSet<>(unitIdValues).size()!=unitIdValues.size())
            throw ApiException.invalid("처리할 메뉴를 선택해 주세요.");
        UUID orderId=parseId(orderIdValue);
        List<UUID> ids=unitIdValues.stream().map(PreparationService::parseId).toList();
        String from=switch(action) {case "START"->"PENDING";case "COMPLETE"->"COOKING";case "SERVE"->"READY";default->throw ApiException.invalid("지원하지 않는 처리입니다.");};
        String to=switch(action) {case "START"->"COOKING";case "COMPLETE"->"READY";default->"SERVED";};
        var order=jdbc.query("""
            SELECT o.payment_method,o.coin_received_at,o.payment_status,o.status,s.status AS visit_status
            FROM live_orders o JOIN live_table_sessions s ON s.session_id=o.session_id WHERE o.order_id=? FOR UPDATE OF o
            """,rs->rs.next()?ApiEnvelope.map("coin",rs.getString(1).equals("COIN"),"received",rs.getObject(2)!=null,
                "paid",rs.getString(3).equals("PAID"),"cancelled",rs.getString(4).equals("CANCELLED"),"open",rs.getString(5).equals("OPEN")):null,orderId);
        if(order==null || !(boolean)order.get("open") || (boolean)order.get("paid") || (boolean)order.get("cancelled"))
            throw ApiException.conflict("ORDER_NOT_ACTIVE","진행 중인 주문이 아닙니다.");
        if(action.equals("SERVE") && (boolean)order.get("coin") && !(boolean)order.get("received"))
            throw ApiException.conflict("COINS_NOT_RECEIVED","엽전을 먼저 수령해 주세요.");
        var units=jdbc.query("""
            SELECT u.unit_id,u.status,u.batch_id,i.preparation_station FROM order_preparation_units u
            JOIN order_items i USING(order_item_id) WHERE i.order_id=? AND i.status='ACTIVE' AND u.unit_id=ANY(?::uuid[])
            """,(rs,n)->ApiEnvelope.map("id",rs.getObject(1,UUID.class),"status",rs.getString(2),"batch",rs.getObject(3,UUID.class),"station",rs.getString(4)),orderId,array(ids));
        if(units.size()!=ids.size()) throw ApiException.conflict("PREPARATION_CHANGED","주문 항목이 변경되었습니다. 다시 확인해 주세요.");
        if(!action.equals("SERVE") && units.stream().anyMatch(u->!u.get("station").equals("KITCHEN")))
            throw ApiException.invalid("음료는 서빙 화면에서 처리해 주세요.");
        // An exact replay may succeed, but never advance a unit to a second state.
        if(units.stream().allMatch(u->rank((String)u.get("status"))>=rank(to))) return null;
        if(units.stream().anyMatch(u->!u.get("status").equals(from)))
            throw ApiException.conflict("PREPARATION_CHANGED","다른 기기에서 처리한 항목이 있습니다. 새로고침 후 다시 선택해 주세요.");
        if(action.equals("SERVE") && units.stream().map(u->u.get("batch")).distinct().count()!=1)
            throw ApiException.invalid("서빙 카드별로 완료해 주세요.");
        UUID batch=action.equals("COMPLETE")?UUID.randomUUID():null;
        jdbc.update("""
            UPDATE order_preparation_units SET status=?,
              started_at=CASE WHEN ?='COOKING' THEN now() ELSE started_at END,
              batch_id=COALESCE(?,batch_id),ready_at=CASE WHEN ?='READY' THEN now() ELSE ready_at END,
              served_at=CASE WHEN ?='SERVED' THEN now() ELSE served_at END WHERE unit_id=ANY(?::uuid[])
            """,to,to,batch,to,to,array(ids));
        recalculate(orderId);
        jdbc.update("INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,to_value) VALUES(?,'STAFF',?,'PREPARATION_TRANSITION','ORDER',?,?)",
            UUID.randomUUID(),staff.deviceLabel(),orderId.toString(),action+":"+ids);
        events.publishOrder("order.item.updated",orderId.toString(),orderId,Map.of("action",action));
        return null;
    }

    public void recalculate(UUID orderId) {
        jdbc.update("""
            UPDATE order_items i SET preparation_status=x.status,prepared_at=x.ready_at,served_at=x.served_at,updated_at=now()
            FROM (SELECT u.order_item_id,CASE WHEN bool_and(u.status='SERVED') THEN 'SERVED'
              WHEN bool_or(u.status IN ('PENDING','COOKING')) THEN 'PENDING' ELSE 'READY' END AS status,
              min(u.ready_at) AS ready_at,max(u.served_at) AS served_at
              FROM order_preparation_units u JOIN order_items i USING(order_item_id)
              WHERE i.order_id=? GROUP BY u.order_item_id) x WHERE i.order_item_id=x.order_item_id
            """,orderId);
        var statuses=jdbc.queryForList("SELECT u.status FROM order_preparation_units u JOIN order_items i USING(order_item_id) WHERE i.order_id=? AND i.status='ACTIVE'",String.class,orderId);
        if(statuses.isEmpty())return;
        String status=statuses.stream().allMatch("SERVED"::equals)?"COMPLETED":
            statuses.stream().allMatch("PENDING"::equals)?"RECEIVED":
            statuses.stream().anyMatch(s->s.equals("PENDING")||s.equals("COOKING"))?"PREPARING":"SERVING";
        jdbc.update("UPDATE live_orders SET status=?,public_status=?,status_updated_at=now(),updated_at=now() WHERE order_id=?",
            status,CustomerOrderStatus.fromInternal(status),orderId);
    }

    public List<Map<String,Object>> kitchen() {
        return jdbc.query("""
            SELECT o.order_id,o.order_kind,s.table_id,u.status,o.created_at,o.note,o.note_audience
            FROM live_orders o JOIN live_table_sessions s ON s.session_id=o.session_id
            JOIN order_items i ON i.order_id=o.order_id JOIN order_preparation_units u USING(order_item_id)
            WHERE s.status='OPEN' AND o.status<>'CANCELLED' AND o.payment_status<>'PAID' AND i.status='ACTIVE'
              AND i.preparation_station='KITCHEN' AND u.status IN ('PENDING','COOKING')
            GROUP BY o.order_id,o.order_kind,s.table_id,u.status,o.created_at,o.note,o.note_audience ORDER BY o.created_at,u.status
            """,(rs,n)->ApiEnvelope.map("cardId",rs.getString("order_id")+":"+rs.getString("status"),
            "orderId",rs.getString("order_id"),"orderKind",rs.getString("order_kind"),"tableId",rs.getString("table_id"),"status",rs.getString("status").equals("PENDING")?"RECEIVED":"COOKING",
            "createdAt",rs.getObject("created_at",OffsetDateTime.class).toInstant().toString(),
            "items",units(rs.getObject("order_id",UUID.class),rs.getString("status")),
            "kitchenNote",note(rs.getString("note"),rs.getString("note_audience"),"KITCHEN")));
    }

    public List<Map<String,Object>> serving() {
        return jdbc.query("""
            SELECT o.order_id,o.order_kind,s.table_id,o.payment_method,o.coin_total,o.coin_received_at,u.batch_id,min(u.ready_at) AS ready_at,o.note,o.note_audience
            FROM live_orders o JOIN live_table_sessions s ON s.session_id=o.session_id
            JOIN order_items i ON i.order_id=o.order_id JOIN order_preparation_units u USING(order_item_id)
            WHERE s.status='OPEN' AND o.status<>'CANCELLED' AND o.payment_status<>'PAID' AND i.status='ACTIVE' AND u.status='READY'
            GROUP BY o.order_id,o.order_kind,s.table_id,o.payment_method,o.coin_total,o.coin_received_at,u.batch_id,o.note,o.note_audience ORDER BY ready_at,u.batch_id
            """,(rs,n)->ApiEnvelope.map("cardId",rs.getString("batch_id"),"orderId",rs.getString("order_id"),"orderKind",rs.getString("order_kind"),"tableId",rs.getString("table_id"),
            "paymentMethod",rs.getString("payment_method"),"coinTotal",rs.getInt("coin_total"),"coinReceived",rs.getObject("coin_received_at")!=null,
            "readyAt",rs.getObject("ready_at",OffsetDateTime.class).toInstant().toString(),
            "items",servingItems(rs.getObject("order_id",UUID.class),rs.getObject("batch_id",UUID.class)),
            "remainingKitchenItemCount",jdbc.queryForObject("SELECT count(*) FROM order_preparation_units u JOIN order_items i USING(order_item_id) WHERE i.order_id=? AND i.status='ACTIVE' AND i.preparation_station='KITCHEN' AND u.status IN ('PENDING','COOKING')",Integer.class,rs.getObject("order_id",UUID.class)),
            "servingNote",note(rs.getString("note"),rs.getString("note_audience"),"SERVING")));
    }

    private List<Map<String,Object>> units(UUID orderId,String status) {
        return jdbc.query("""
            SELECT u.unit_id,i.menu_name_snapshot,u.unit_no FROM order_preparation_units u JOIN order_items i USING(order_item_id)
            WHERE i.order_id=? AND i.status='ACTIVE' AND i.preparation_station='KITCHEN' AND u.status=? ORDER BY i.line_no,u.unit_no
            """,(rs,n)->ApiEnvelope.map("itemId",rs.getString(1),"unitIds",List.of(rs.getString(1)),"name",rs.getString(2),"quantity",1,"unitNumber",rs.getInt(3),"preparationStatus",status),orderId,status);
    }
    private List<Map<String,Object>> servingItems(UUID orderId,UUID batch) {
        return jdbc.query("""
            SELECT i.order_item_id,i.menu_name_snapshot,count(*) AS quantity,array_agg(u.unit_id ORDER BY u.unit_no) AS ids
            FROM order_preparation_units u JOIN order_items i USING(order_item_id)
            WHERE i.order_id=? AND i.status='ACTIVE' AND u.status='READY' AND u.batch_id=?
            GROUP BY i.order_item_id ORDER BY i.line_no
            """,(rs,n)->ApiEnvelope.map("itemId",rs.getString(1),"name",rs.getString(2),"quantity",rs.getInt(3),
                "unitIds",Arrays.stream((Object[])rs.getArray("ids").getArray()).map(Object::toString).toList(),"preparationStatus","READY"),orderId,batch);
    }
    private static String note(String text,String audience,String station) { return "GENERAL".equals(audience)||station.equals(audience)?text:null; }
    private static int rank(String state) { return List.of("PENDING","COOKING","READY","SERVED").indexOf(state); }
    private static UUID parseId(String id) {try{return UUID.fromString(id);}catch(RuntimeException e){throw ApiException.invalid("주문 항목 ID를 확인해 주세요.");}}
    private static String array(List<UUID> ids) {return "{"+String.join(",",ids.stream().map(UUID::toString).toList())+"}";}
}
