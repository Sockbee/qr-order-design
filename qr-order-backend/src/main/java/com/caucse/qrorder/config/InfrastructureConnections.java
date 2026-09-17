package com.caucse.qrorder.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/** One LISTEN connection and one short number-allocation connection, outside the request pool. */
@Component
public class InfrastructureConnections {
    private final HikariDataSource pool;

    public InfrastructureConnections(DataSource dataSource, MeterRegistry metrics) throws SQLException {
        HikariDataSource source = dataSource.unwrap(HikariDataSource.class);
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(source.getJdbcUrl());
        config.setUsername(source.getUsername());
        config.setPassword(source.getPassword());
        config.setDataSourceProperties(source.getDataSourceProperties());
        config.setPoolName("qr-infrastructure");
        config.setMaximumPoolSize(2);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(source.getConnectionTimeout());
        config.setMetricRegistry(metrics);
        pool = new HikariDataSource(config);
    }

    public Connection connection() throws SQLException { return pool.getConnection(); }

    @PreDestroy
    public void close() { pool.close(); }
}
