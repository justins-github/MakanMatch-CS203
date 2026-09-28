package com.makanmatch.account_service.claim;

/** A claim starts PENDING and ends in exactly one of the other states. */
public enum ClaimStatus {
	PENDING, APPROVED, REJECTED, WITHDRAWN
}
