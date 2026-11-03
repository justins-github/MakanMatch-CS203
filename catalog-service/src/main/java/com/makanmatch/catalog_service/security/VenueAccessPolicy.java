package com.makanmatch.catalog_service.security;

import org.springframework.stereotype.Component;

import com.makanmatch.catalog_service.common.ForbiddenException;
import com.makanmatch.catalog_service.common.UnauthorizedException;

/**
 * Decides what a signed-in caller may do at a venue. Managing (status updates,
 * official menu and prices) needs both an owner-or-admin role for this request
 * and ownership of that venue; an admin acting as a plain user loses it, just
 * like a real user would. Everyone signed in can still contribute as a diner.
 */
@Component
public class VenueAccessPolicy {

	public enum Access {
		/** Can add community dishes and report the price they paid. */
		DINER,
		/** Can also edit the venue's status and official menu. */
		MANAGER
	}

	private final AccountClient accounts;

	public VenueAccessPolicy(AccountClient accounts) {
		this.accounts = accounts;
	}

	public Access accessFor(Caller caller, String venueId) {
		AccountClient.Me me = accounts.me(caller)
				.orElseThrow(() -> new UnauthorizedException("Your session is no longer valid - please sign in again"));
		return me.managesVenues() && me.owns(venueId) ? Access.MANAGER : Access.DINER;
	}

	public void requireManager(Caller caller, String venueId) {
		if (accessFor(caller, venueId) != Access.MANAGER) {
			throw new ForbiddenException("Only an owner of this venue can do that");
		}
	}
}
