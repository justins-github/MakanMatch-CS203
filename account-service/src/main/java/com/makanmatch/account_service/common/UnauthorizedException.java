package com.makanmatch.account_service.common;

/** Domain error mapped to HTTP 401 Unauthorized - credentials missing or wrong. */
public class UnauthorizedException extends RuntimeException {

	public UnauthorizedException(String message) {
		super(message);
	}
}
