package com.makanmatch.account_service.admin;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.admin.dto.AdminUserResponse;
import com.makanmatch.account_service.admin.dto.UpdateUserRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

/** /api/admin/** needs the ADMIN role (see SecurityConfig). */
@RestController
@RequestMapping("/api/admin/users")
@Tag(name = "Admin: users", description = "Manage accounts and roles (needs the ADMIN role)")
@SecurityRequirement(name = "bearer")
public class UserAdminController {

	private final UserAdminService users;

	public UserAdminController(UserAdminService users) {
		this.users = users;
	}

	@GetMapping
	@Operation(summary = "List accounts, optionally filtered by email, name or username")
	public List<AdminUserResponse> list(@RequestParam(required = false) String q) {
		return users.list(q);
	}

	@PatchMapping("/{id}")
	@Operation(summary = "Promote/demote admin or disable/enable an account")
	public AdminUserResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@RequestBody UpdateUserRequest body) {
		return users.update(UUID.fromString(jwt.getSubject()), id, body);
	}

	@DeleteMapping("/{id}/venues/{venueId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Revoke an account's ownership of a venue")
	public void revokeOwnership(@PathVariable UUID id, @PathVariable String venueId) {
		users.revokeOwnership(id, venueId);
	}
}
