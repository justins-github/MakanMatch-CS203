package com.makanmatch.catalog_service.common;

/** Domain error mapped to HTTP 403 Forbidden - signed in, but not allowed to do this. */
public class ForbiddenException extends RuntimeException {

	public ForbiddenException(String message) {
		super(message);
	}
}
