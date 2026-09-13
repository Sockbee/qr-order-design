package com.caucse.qrorder.domain;

/** Customer progress ends at actual serving; kitchen readiness is still preparing. */
public final class CustomerOrderStatus {
    private CustomerOrderStatus() {}

    public static String fromInternal(String status) {
        return switch (status) {
            case "RECEIVED", "CONFIRMED" -> "accepted";
            case "PREPARING", "SERVING" -> "preparing";
            case "COMPLETED" -> "served";
            case "CANCELLED" -> "cancelled";
            default -> throw new IllegalArgumentException("Unknown order status: " + status);
        };
    }
}
