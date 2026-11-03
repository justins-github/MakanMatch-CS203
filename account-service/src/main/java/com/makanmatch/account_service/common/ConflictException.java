package com.makanmatch.account_service.common;

/** Domain error mapped to HTTP 409 Conflict - the request clashes with current state (duplicate, wrong status). */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}
}
