package com.makanmatch.context_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@ConfigurationPropertiesScan
@EnableScheduling
@SpringBootApplication
public class ContextServiceApplication {

	public static void main(String[] args) {
		SpringApplication.run(ContextServiceApplication.class, args);
	}

}
