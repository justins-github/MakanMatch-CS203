package com.makanmatch.context_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class RestClientConfig {

    // Without limits a slow upstream holds the request (and, on Vercel, the
    // billed instance) open indefinitely. Same limits as catalog-service's
    // calls to account-service.
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    @Bean
    RestClient.Builder oneMapRestClientBuilder(OneMapProperties props) {
        return RestClient.builder().baseUrl(props.baseUrl()).requestFactory(withTimeouts());
    }

    @Bean
    RestClient oneMapRestClient(RestClient.Builder oneMapRestClientBuilder) {
        return oneMapRestClientBuilder.build();
    }

    @Bean
    RestClient neaRestClient(NeaProperties props) {
        return RestClient.builder().baseUrl(props.baseUrl()).requestFactory(withTimeouts()).build();
    }

    @Bean
    RestClient catalogRestClient(CatalogServiceProperties props) {
        return RestClient.builder().baseUrl(props.baseUrl()).requestFactory(withTimeouts()).build();
    }

    private static ClientHttpRequestFactory withTimeouts() {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        factory.setReadTimeout(READ_TIMEOUT);
        return factory;
    }
}
