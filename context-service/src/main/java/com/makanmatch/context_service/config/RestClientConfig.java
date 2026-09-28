package com.makanmatch.context_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    @Bean
    RestClient.Builder oneMapRestClientBuilder(OneMapProperties props) {
        return RestClient.builder().baseUrl(props.baseUrl());
    }

    @Bean
    RestClient oneMapRestClient(RestClient.Builder oneMapRestClientBuilder) {
        return oneMapRestClientBuilder.build();
    }
}
