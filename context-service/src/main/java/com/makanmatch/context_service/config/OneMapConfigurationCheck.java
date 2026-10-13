package com.makanmatch.context_service.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** Logs missing optional local credentials without preventing the service from starting. */
@Component
public class OneMapConfigurationCheck {
    private static final Logger log = LoggerFactory.getLogger(OneMapConfigurationCheck.class);
    private final OneMapProperties properties;

    public OneMapConfigurationCheck(OneMapProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    void check() {
        List<String> missing = new ArrayList<>();
        if (properties.email() == null || properties.email().isBlank()) missing.add("ONEMAP_EMAIL");
        if (properties.password() == null || properties.password().isBlank()) missing.add("ONEMAP_PASSWORD");
        if (!missing.isEmpty()) {
            log.warn("Missing OneMap configuration variable(s): {}. OneMap-backed requests may fail until configured.",
                    String.join(", ", missing));
        }
    }
}
