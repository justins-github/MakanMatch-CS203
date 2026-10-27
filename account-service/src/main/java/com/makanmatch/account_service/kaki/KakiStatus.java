package com.makanmatch.account_service.kaki;

/** A request is PENDING until the other person accepts it. Declining deletes it instead. */
public enum KakiStatus {
	PENDING, ACCEPTED
}
