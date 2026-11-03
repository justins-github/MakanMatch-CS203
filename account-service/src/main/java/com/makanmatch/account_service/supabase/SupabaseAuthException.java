package com.makanmatch.account_service.supabase;

import java.util.Set;

/** An error response from Supabase Auth, or Supabase being unreachable (status 503). */
public class SupabaseAuthException extends RuntimeException {

	private final int status;
	private final String code;

	public SupabaseAuthException(int status, String code, String message) {
		super(message == null ? "Supabase Auth error " + status : message);
		this.status = status;
		this.code = code;
	}

	public int status() {
		return status;
	}

	/** Supabase's machine-readable error code, e.g. "email_exists" (may be null). */
	public String code() {
		return code;
	}

	public boolean hasCode(String... codes) {
		return code != null && Set.of(codes).contains(code);
	}

	public boolean isClientError() {
		return status >= 400 && status < 500;
	}
}
