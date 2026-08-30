package com.caucse.qrorder.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.info.License;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.BooleanSchema;
import io.swagger.v3.oas.models.media.DateTimeSchema;
import io.swagger.v3.oas.models.media.ObjectSchema;
import io.swagger.v3.oas.models.media.StringSchema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.models.GroupedOpenApi;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@OpenAPIDefinition(
        info = @Info(
                title = "QR Order API",
                version = "v1",
                description = "QR 주문 고객·운영·관리 API. 모든 JSON 응답은 success/data/error/meta envelope를 사용합니다.",
                license = @License(name = "Private API")
        )
)
@SecurityScheme(
        name = OpenApiConfig.STAFF_BEARER,
        type = SecuritySchemeType.HTTP,
        scheme = "bearer",
        bearerFormat = "staff token",
        description = "POST /api/v1/staff/login 응답의 staffToken"
)
public class OpenApiConfig {
    public static final String STAFF_BEARER = "staffBearer";

    @Bean
    OpenAPI qrOrderOpenApi() {
        var error = new ObjectSchema()
                .addProperty("code", new StringSchema().example("INVALID_REQUEST"))
                .addProperty("message", new StringSchema().example("요청 정보를 확인해 주세요."))
                .addProperty("retryable", new BooleanSchema().example(false))
                .addProperty("details", new ObjectSchema().nullable(true));
        var meta = new ObjectSchema()
                .addProperty("apiVersion", new StringSchema().example("v1"))
                .addProperty("requestId", new StringSchema().format("uuid"))
                .addProperty("serverTime", new DateTimeSchema());
        var errorEnvelope = new ObjectSchema()
                .addProperty("success", new BooleanSchema().example(false))
                .addProperty("data", new ObjectSchema().nullable(true))
                .addProperty("error", error)
                .addProperty("meta", meta);

        return new OpenAPI().components(new Components()
                .addSchemas("ApiErrorEnvelope", errorEnvelope)
                .addResponses("ApiError", new ApiResponse()
                        .description("표준 오류 envelope. 실제 HTTP status와 error.code를 함께 확인합니다.")
                        .content(new io.swagger.v3.oas.models.media.Content().addMediaType(
                                "application/json",
                                new io.swagger.v3.oas.models.media.MediaType().schema(
                                        new io.swagger.v3.oas.models.media.Schema<>().$ref(
                                                "#/components/schemas/ApiErrorEnvelope"))))));
    }

    @Bean
    OpenApiCustomizer standardErrorEnvelope() {
        return openApi -> openApi.getPaths().values().forEach(path -> path.readOperations().forEach(operation -> {
            ApiResponses responses = operation.getResponses();
            if (responses != null && !responses.containsKey("default")) {
                responses.addApiResponse("default", new ApiResponse().$ref("#/components/responses/ApiError"));
            }
        }));
    }

    @Bean
    GroupedOpenApi allApi(OpenApiCustomizer standardErrorEnvelope) {
        return group("all", "/api/v1/**", standardErrorEnvelope);
    }

    @Bean
    GroupedOpenApi customerApi(OpenApiCustomizer standardErrorEnvelope) {
        return group("customer", "/api/v1/customer/**", standardErrorEnvelope);
    }

    @Bean
    GroupedOpenApi staffApi(OpenApiCustomizer standardErrorEnvelope) {
        return group("staff", "/api/v1/staff/**", standardErrorEnvelope);
    }

    @Bean
    GroupedOpenApi adminApi(OpenApiCustomizer standardErrorEnvelope) {
        return group("admin", "/api/v1/admin/**", standardErrorEnvelope);
    }

    private static GroupedOpenApi group(String name, String path, OpenApiCustomizer customizer) {
        return GroupedOpenApi.builder()
                .group(name)
                .pathsToMatch(path)
                .addOpenApiCustomizer(customizer)
                .build();
    }
}
