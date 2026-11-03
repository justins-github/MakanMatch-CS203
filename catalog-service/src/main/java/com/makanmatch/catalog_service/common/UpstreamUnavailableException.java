package com.makanmatch.catalog_service.common;

/** Domain error mapped to HTTP 503 - a service we depend on (account-service) didn't answer. */
public class UpstreamUnavailableException extends RuntimeException {

	public UpstreamUnavailableException(String message) {
		super(message);
	}
}
