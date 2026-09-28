package com.makanmatch.account_service.profile;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.common.EffectiveRole;
import com.makanmatch.account_service.profile.dto.ChangePasswordRequest;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.profile.dto.UpdateProfileRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "The signed-in account's profile")
@SecurityRequirement(name = "bearer")
public class MeController {

	private final ProfileService profiles;

	public MeController(ProfileService profiles) {
		this.profiles = profiles;
	}

	@GetMapping
	@Operation(summary = "Who am I, which role is this request served as, and which venues do I manage",
			parameters = @Parameter(name = "X-Act-As", in = ParameterIn.HEADER,
					description = "Admins only: user, owner or admin"))
	public MeResponse me(@AuthenticationPrincipal Jwt jwt, Authentication authentication) {
		return profiles.me(userId(jwt), jwt.getClaimAsString("email"), role(authentication));
	}

	@PatchMapping
	@Operation(summary = "Change display name and/or username (send \"\" to remove the username)")
	public MeResponse update(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
			@Valid @RequestBody UpdateProfileRequest body) {
		return profiles.update(userId(jwt), jwt.getClaimAsString("email"), role(authentication), body);
	}

	@PutMapping("/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Change password (the current password is re-checked)")
	public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest body) {
		profiles.changePassword(userId(jwt), jwt.getClaimAsString("email"), body.currentPassword(), body.newPassword());
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}

	private static EffectiveRole role(Authentication authentication) {
		return EffectiveRole.fromAuthorities(authentication.getAuthorities());
	}
}
