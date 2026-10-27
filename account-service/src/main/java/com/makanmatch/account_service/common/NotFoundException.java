package com.makanmatch.account_service.common;

/** Domain error mapped to HTTP 404 Not Found - the thing asked for does not exist. */
public class NotFoundException extends RuntimeException {

	public NotFoundException(String message) {
		super(message);
	}
}
