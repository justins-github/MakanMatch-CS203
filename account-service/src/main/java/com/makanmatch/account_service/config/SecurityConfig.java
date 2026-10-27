package com.makanmatch.account_service.config;

import java.nio.charset.StandardCharsets;

import javax.crypto.spec.SecretKeySpec;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;

import com.makanmatch.account_service.owner.OwnershipService;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.security.ActAsResolver;
import com.makanmatch.account_service.security.ProfileAuthenticationConverter;
import com.makanmatch.account_service.supabase.SupabaseProperties;

/**
 * Stateless bearer-token API. Every request other than /api/auth/** and the API
 * docs must carry a Supabase access token that verifies against the project's
 * signing keys; roles then come from our database (see ProfileAuthenticationConverter).
 */
@Configuration
public class SecurityConfig {

	private static final String SUPABASE_AUDIENCE = "authenticated";

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http, ProfileService profiles, OwnershipService ownership,
			ActAsResolver actAs) throws Exception {
		ProfileAuthenticationConverter converter = new ProfileAuthenticationConverter(profiles, ownership, actAs);
		// The /api/auth routes are public: never try to authenticate them with a
		// bearer token, or an expired token would block signing out.
		DefaultBearerTokenResolver standard = new DefaultBearerTokenResolver();
		BearerTokenResolver tokens = request -> request.getRequestURI().startsWith("/api/auth/")
				? null
				: standard.resolve(request);
		http
				// No cookies authenticate these routes (bearer tokens do), so there is no
				// CSRF risk; the two cookie routes have their own header check.
				.csrf(csrf -> csrf.disable())
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.httpBasic(basic -> basic.disable())
				.formLogin(form -> form.disable())
				.authorizeHttpRequests(auth -> auth
						.requestMatchers("/api/auth/**").permitAll()
						.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
						.requestMatchers("/error").permitAll()
						.requestMatchers("/api/admin/**").hasRole("ADMIN")
						.requestMatchers("/api/owner/**").hasRole("OWNER")
						.anyRequest().authenticated())
				.oauth2ResourceServer(oauth -> oauth
						.bearerTokenResolver(tokens)
						.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)));
		return http.build();
	}

	/**
	 * Verifies signature, expiry, issuer and audience. New Supabase projects sign
	 * with an asymmetric key published as JWKS; legacy projects use a shared secret.
	 */
	@Bean
	JwtDecoder jwtDecoder(SupabaseProperties supabase) {
		NimbusJwtDecoder decoder = supabase.usesLegacyJwtSecret()
				? NimbusJwtDecoder.withSecretKey(new SecretKeySpec(
						supabase.jwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"))
						.macAlgorithm(MacAlgorithm.HS256).build()
				: NimbusJwtDecoder.withJwkSetUri(supabase.jwksUri())
						.jwsAlgorithms(algorithms -> {
							algorithms.add(SignatureAlgorithm.ES256);
							algorithms.add(SignatureAlgorithm.RS256);
						})
						.build();
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
				JwtValidators.createDefaultWithIssuer(supabase.issuer()),
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
