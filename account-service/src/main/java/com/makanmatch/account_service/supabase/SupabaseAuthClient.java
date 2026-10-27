package com.makanmatch.account_service.supabase;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Thin typed wrapper over the Supabase Auth REST API. Supabase stores the email
 * and the password hash; this service never sees or stores a password hash.
 */
@Component
public class SupabaseAuthClient {

	/** Supabase has no "forever" ban; 100 years is the usual stand-in. */
	private static final String BAN_FOREVER = "876000h";
	private static final int PAGE_SIZE = 200;
	private static final int MAX_PAGES = 25;

	private final SupabaseProperties props;
	private final RestClient http;

	public SupabaseAuthClient(SupabaseProperties props) {
		this.props = props;
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(
				HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
		factory.setReadTimeout(Duration.ofSeconds(10));
		this.http = RestClient.builder().baseUrl(props.authUrl()).requestFactory(factory).build();
	}

	/** Creates an already-confirmed user: we don't send confirmation emails (see README). */
	public SupabaseUser createUser(String email, String password, String displayName) {
		Map<String, Object> body = Map.of(
				"email", email,
				"password", password,
				"email_confirm", true,
				"user_metadata", Map.of("display_name", displayName));
		return call(http.post().uri("/admin/users").headers(this::adminHeaders).body(body), SupabaseUser.class);
	}

	public SupabaseSession signInWithPassword(String email, String password) {
		return call(http.post().uri("/token?grant_type=password").headers(this::publicHeaders)
				.body(Map.of("email", email, "password", password)), SupabaseSession.class);
	}

	/** Exchanges a refresh token for a new session; the old refresh token stops working. */
	public SupabaseSession refresh(String refreshToken) {
		return call(http.post().uri("/token?grant_type=refresh_token").headers(this::publicHeaders)
				.body(Map.of("refresh_token", refreshToken)), SupabaseSession.class);
	}

	/** Ends the session this access token belongs to, so its refresh token stops working. */
	public void signOut(String accessToken) {
		call(http.post().uri("/logout?scope=local").headers(h -> userHeaders(h, accessToken)), Void.class);
	}

	public SupabaseUser getUser(UUID id) {
		return call(http.get().uri("/admin/users/{id}", id).headers(this::adminHeaders), SupabaseUser.class);
	}

	/** All users, page by page (fine at student-project scale). */
	public List<SupabaseUser> listUsers() {
		List<SupabaseUser> all = new ArrayList<>();
		for (int page = 1; page <= MAX_PAGES; page++) {
			UserPage result = call(http.get().uri("/admin/users?page={page}&per_page={size}", page, PAGE_SIZE)
					.headers(this::adminHeaders), UserPage.class);
			List<SupabaseUser> users = result == null || result.users() == null ? List.of() : result.users();
			all.addAll(users);
			if (users.size() < PAGE_SIZE) break;
		}
		return all;
	}

	public void updatePassword(UUID id, String newPassword) {
		call(http.put().uri("/admin/users/{id}", id).headers(this::adminHeaders)
				.body(Map.of("password", newPassword)), SupabaseUser.class);
	}

	/** Banned users can't sign in or refresh, so a disabled account is locked out within one token lifetime. */
	public void setBanned(UUID id, boolean banned) {
		call(http.put().uri("/admin/users/{id}", id).headers(this::adminHeaders)
				.body(Map.of("ban_duration", banned ? BAN_FOREVER : "none")), SupabaseUser.class);
	}

	private <T> T call(RestClient.RequestHeadersSpec<?> request, Class<T> type) {
		try {
			return request.exchange((req, res) -> {
				if (res.getStatusCode().isError()) {
					throw error(res.getStatusCode().value(), readError(res));
				}
				return type == Void.class ? null : res.bodyTo(type);
			});
		}
		catch (ResourceAccessException e) {
			throw new SupabaseAuthException(503, "unreachable", "Supabase Auth is unreachable");
		}
	}

	@SuppressWarnings("unchecked")
	private static Map<String, Object> readError(RestClient.RequestHeadersSpec.ConvertibleClientHttpResponse res) {
		try {
			Map<String, Object> body = res.bodyTo(Map.class);
			return body == null ? Map.of() : body;
		}
		catch (Exception e) {
			return Map.of();
		}
	}

	/** Supabase has used both {error_code, msg} and {error, error_description} error shapes. */
	private static SupabaseAuthException error(int status, Map<String, Object> body) {
		String code = firstString(body, "error_code", "error");
		String message = firstString(body, "msg", "error_description", "message");
		return new SupabaseAuthException(status, code, message);
	}

	private static String firstString(Map<String, Object> body, String... keys) {
		for (String key : keys) {
			if (body.get(key) instanceof String s && !s.isBlank()) return s;
		}
		return null;
	}

	private void publicHeaders(HttpHeaders headers) {
		headers.set("apikey", props.publishableKey());
	}

	private void userHeaders(HttpHeaders headers, String accessToken) {
		headers.set("apikey", props.publishableKey());
		headers.setBearerAuth(accessToken);
	}

	/**
	 * New-style secret keys (sb_secret_...) go in the apikey header only; the
	 * legacy service_role key is a JWT and is also sent as the bearer token.
	 */
	private void adminHeaders(HttpHeaders headers) {
		headers.set("apikey", props.secretKey());
		if (props.secretKey().startsWith("eyJ")) headers.setBearerAuth(props.secretKey());
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	private record UserPage(List<SupabaseUser> users) {
	}
}
