package com.makanmatch.catalog_service.config;

import java.nio.charset.StandardCharsets;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Reads are public (venue and menu data is public information). Writes need a
 * valid Supabase access token; what the caller may write is then decided per
 * venue by VenueAccessPolicy, which asks account-service.
 */
@Configuration
public class SecurityConfig {

	private static final String SUPABASE_AUDIENCE = "authenticated";

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http) throws Exception {
		http
				// Bearer tokens only, no cookies: nothing for a CSRF attack to ride on.
				.csrf(csrf -> csrf.disable())
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.httpBasic(basic -> basic.disable())
				.formLogin(form -> form.disable())
				.authorizeHttpRequests(auth -> auth
						.requestMatchers(HttpMethod.GET, "/api/catalog/**").permitAll()
						.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
						.requestMatchers("/error").permitAll()
						.anyRequest().authenticated())
				.oauth2ResourceServer(oauth -> oauth.jwt(jwt -> {
				}));
		return http.build();
	}

	/** Same verification as account-service: signature, expiry, issuer and audience. */
	@Bean
	JwtDecoder jwtDecoder(@Value("${supabase.url}") String supabaseUrl,
			@Value("${supabase.jwt-secret:}") String legacyJwtSecret) {
		String issuer = supabaseUrl.replaceAll("/+$", "") + "/auth/v1";
		NimbusJwtDecoder decoder = legacyJwtSecret != null && !legacyJwtSecret.isBlank()
				? NimbusJwtDecoder.withSecretKey(new SecretKeySpec(
						legacyJwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
						.macAlgorithm(MacAlgorithm.HS256).build()
				: NimbusJwtDecoder.withJwkSetUri(issuer + "/.well-known/jwks.json")
						.jwsAlgorithms(algorithms -> {
							algorithms.add(SignatureAlgorithm.ES256);
							algorithms.add(SignatureAlgorithm.RS256);
						})
						.build();
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
				JwtValidators.createDefaultWithIssuer(issuer),
				SecurityConfig::audienceIsAuthenticated));
		return decoder;
	}

	private static OAuth2TokenValidatorResult audienceIsAuthenticated(Jwt jwt) {
		if (jwt.getAudience() != null && jwt.getAudience().contains(SUPABASE_AUDIENCE)) {
			return OAuth2TokenValidatorResult.success();
		}
		return OAuth2TokenValidatorResult.failure(
				new OAuth2Error("invalid_token", "Token is not for signed-in users", null));
	}
}
