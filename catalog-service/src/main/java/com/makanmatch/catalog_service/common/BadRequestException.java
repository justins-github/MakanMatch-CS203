package com.makanmatch.catalog_service.common;

/** Domain error mapped to HTTP 400 Bad Request - the input breaks a business rule. */
public class BadRequestException extends RuntimeException {

	public BadRequestException(String message) {
		super(message);
	}
}
