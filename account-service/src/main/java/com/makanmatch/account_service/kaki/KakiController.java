package com.makanmatch.account_service.kaki;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.kaki.dto.AddKakiRequest;
import com.makanmatch.account_service.kaki.dto.GroupResponse;
import com.makanmatch.account_service.kaki.dto.KakisResponse;
import com.makanmatch.account_service.kaki.dto.PartyMember;
import com.makanmatch.account_service.kaki.dto.SaveGroupRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/kakis")
@Tag(name = "Kakis", description = "People you eat with: requests, your kakis and your saved groups")
@SecurityRequirement(name = "bearer")
public class KakiController {

	private final KakiService kakis;

	public KakiController(KakiService kakis) {
		this.kakis = kakis;
	}

	@GetMapping
	@Operation(summary = "My kakis, requests to me and requests I sent, each oldest first")
	public KakisResponse list(@AuthenticationPrincipal Jwt jwt) {
		return kakis.kakis(userId(jwt));
	}

	@PostMapping("/requests")
	@Operation(summary = "Ask someone by username (201); if they already asked me, this accepts it (200)")
	public ResponseEntity<KakisResponse> request(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody AddKakiRequest body) {
		KakiService.Added added = kakis.request(userId(jwt), body.username());
		return ResponseEntity.status(added.acceptedTheirs() ? HttpStatus.OK : HttpStatus.CREATED).body(added.kakis());
	}

	@PostMapping("/requests/{requesterId}/accept")
	@Operation(summary = "Accept a request someone sent me")
	public KakisResponse accept(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requesterId) {
		return kakis.accept(userId(jwt), requesterId);
	}

	@DeleteMapping("/{otherId}")
	@Operation(summary = "Decline, cancel or remove; each of us also leaves the other's groups")
	public KakisResponse delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID otherId) {
		return kakis.delete(userId(jwt), otherId);
	}

	@GetMapping("/groups")
	@Operation(summary = "My saved groups, by name")
	public List<GroupResponse> groups(@AuthenticationPrincipal Jwt jwt) {
		return kakis.groups(userId(jwt));
	}

	@PostMapping("/groups")
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Save a group of 1-9 of my kakis; returns all my groups")
	public List<GroupResponse> createGroup(@AuthenticationPrincipal Jwt jwt, @RequestBody SaveGroupRequest body) {
		return kakis.createGroup(userId(jwt), body);
	}

	@PutMapping("/groups/{id}")
	@Operation(summary = "Rename a group and replace its members; returns all my groups")
	public List<GroupResponse> updateGroup(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id,
			@RequestBody SaveGroupRequest body) {
		return kakis.updateGroup(userId(jwt), id, body);
	}

	@DeleteMapping("/groups/{id}")
	@Operation(summary = "Delete one of my groups; returns the rest")
	public List<GroupResponse> deleteGroup(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		return kakis.deleteGroup(userId(jwt), id);
	}

	@GetMapping("/party")
	@Operation(summary = "For the engine: up to 9 of my kakis with their dietary restrictions (ids=a,b)")
	public List<PartyMember> party(@AuthenticationPrincipal Jwt jwt, @RequestParam String ids) {
		return kakis.party(userId(jwt), ids);
	}

	private static UUID userId(Jwt jwt) {
		return UUID.fromString(jwt.getSubject());
	}
}
