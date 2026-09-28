package com.makanmatch.catalog_service.menu;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.makanmatch.catalog_service.menu.dto.MenuScanResponse;
import com.makanmatch.catalog_service.security.Caller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/catalog")
@Tag(name = "Menus")
public class MenuScanController {

	private final MenuScanService scans;

	public MenuScanController(MenuScanService scans) {
		this.scans = scans;
	}

	@PostMapping(path = "/venues/{venueId}/menu-scans", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@SecurityRequirement(name = "bearer")
	@Operation(summary = "Read dishes and prices off a menu photo (owners only; JPEG, PNG or WebP up to 5 MB). "
			+ "Nothing is saved and the photo isn't kept - the owner reviews the rows and saves them with "
			+ "PATCH /venues/{venueId}/dishes. Until photo reading is connected, the result is a sample.")
	public MenuScanResponse scan(@AuthenticationPrincipal Jwt jwt,
			@RequestHeader(name = "X-Act-As", required = false) String actAs,
			@PathVariable String venueId, @RequestParam("photo") MultipartFile photo) throws IOException {
		return scans.scan(venueId, photo.getBytes(), Caller.of(jwt, actAs));
	}
}
