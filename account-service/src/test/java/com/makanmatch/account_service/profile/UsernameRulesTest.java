package com.makanmatch.account_service.profile;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UsernameRulesTest {

	@Test
	void normalizesCaseAndSurroundingSpace() {
		assertThat(UsernameRules.normalize("  Justin_W ")).isEqualTo("justin_w");
	}

	@Test
	void acceptsWellFormedNames() {
		assertThat(UsernameRules.problem("justin")).isEmpty();
		assertThat(UsernameRules.problem("makan_fan99")).isEmpty();
		assertThat(UsernameRules.problem("abc")).isEmpty();
	}

	@Test
	void rejectsBadFormats() {
		assertThat(UsernameRules.problem("ab")).isPresent();
		assertThat(UsernameRules.problem("9lives")).isPresent();
		assertThat(UsernameRules.problem("a-b-c")).isPresent();
		assertThat(UsernameRules.problem("me@home")).isPresent();
		assertThat(UsernameRules.problem("a".repeat(21))).isPresent();
		assertThat(UsernameRules.problem(null)).isPresent();
	}

	@Test
	void rejectsReservedNames() {
		assertThat(UsernameRules.problem("admin")).contains("That username is reserved");
		assertThat(UsernameRules.problem(UsernameRules.normalize("MakanMatch"))).contains("That username is reserved");
	}
}
