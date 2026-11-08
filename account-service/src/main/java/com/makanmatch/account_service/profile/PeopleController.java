package com.makanmatch.account_service.profile;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.makanmatch.account_service.profile.dto.PersonCard;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/people")
@Tag(name = "People", description = "The public side of other accounts")
@SecurityRequirement(name = "bearer")
public class PeopleController {

	private final ProfileService profiles;

	public PeopleController(ProfileService profiles) {
		this.profiles = profiles;
	}

	@GetMapping
	@Operation(summary = "For the engine: who these accounts are (ids=a,b, at most 50), leaving out unknown and disabled ones")
	public List<PersonCard> people(@RequestParam String ids) {
		return profiles.people(ids);
	}
}
