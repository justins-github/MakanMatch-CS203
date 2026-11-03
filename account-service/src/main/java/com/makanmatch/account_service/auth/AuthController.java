package com.makanmatch.account_service.auth;

import java.net.URI;
import java.util.Locale;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.makanmatch.account_service.auth.AuthService.AuthResult;
import com.makanmatch.account_service.auth.dto.LoginRequest;
import com.makanmatch.account_service.auth.dto.SessionResponse;
import com.makanmatch.account_service.auth.dto.SignupRequest;
import com.makanmatch.account_service.common.ForbiddenException;
import com.makanmatch.account_service.common.UnauthorizedException;
import com.makanmatch.account_service.profile.ProfileService;
import com.makanmatch.account_service.profile.dto.MeResponse;
import com.makanmatch.account_service.security.LoginRateLimiter;
import com.makanmatch.account_service.supabase.SupabaseSession;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

/**
 * The only way in. The browser never talks to Supabase directly and never holds
 * a Supabase key: it gets an access token in the body and a refresh token in an
 * httpOnly cookie (see {@link RefreshCookie}).
 */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Sign up, sign in, refresh and sign out")
public class AuthController {

	/**
	 * Cookie-authenticated endpoints also require this header. Browsers can't add
	 * custom headers to cross-site requests without a CORS preflight, which this
	 * API never allows, so it blocks cross-site request forgery on top of SameSite.
	 */
	static final String CSRF_HEADER = "X-Requested-With";

	private final AuthService auth;
	private final ProfileService profiles;
	private final LoginRateLimiter limiter;
	private final RefreshCookie cookie;

	public AuthController(AuthService auth, ProfileService profiles, LoginRateLimiter limiter, RefreshCookie cookie) {
		this.auth = auth;
		this.profiles = profiles;
		this.limiter = limiter;
		this.cookie = cookie;
	}

	@PostMapping("/signup")
	@Operation(summary = "Create an account and sign in (no email confirmation step)")
	public ResponseEntity<SessionResponse> signup(@Valid @RequestBody SignupRequest body, HttpServletRequest request) {
		throttle("signup|" + request.getRemoteAddr());
		return session(HttpStatus.CREATED, auth.signup(body));
	}

	@PostMapping("/login")
	@Operation(summary = "Sign in with an email or a username")
	public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
		throttle("login|" + request.getRemoteAddr() + "|" + body.identifier().trim().toLowerCase(Locale.ROOT));
		return session(HttpStatus.OK, auth.login(body));
	}

	@PostMapping("/refresh")
	@Operation(summary = "Swap the refresh cookie for a new access token (and a rotated cookie)",
			parameters = @Parameter(name = CSRF_HEADER, in = ParameterIn.HEADER, required = true,
					description = "Any value, e.g. makanmatch"))
	public ResponseEntity<?> refresh(@CookieValue(name = RefreshCookie.NAME, required = false) String refreshToken,
			@RequestHeader(name = CSRF_HEADER, required = false) String csrfHeader) {
		requireCsrfHeader(csrfHeader);
		if (refreshToken == null || refreshToken.isBlank()) {
			return signedOut("Not signed in");
		}
		SupabaseSession session;
		try {
			session = auth.refresh(refreshToken);
		}
		catch (UnauthorizedException e) {
			return signedOut(e.getMessage());
		}
		return session(HttpStatus.OK, new AuthResult(session, session.user().id()));
	}

	@PostMapping("/logout")
	@Operation(summary = "Sign out: ends the Supabase session and clears the refresh cookie",
			parameters = @Parameter(name = CSRF_HEADER, in = ParameterIn.HEADER, required = true,
					description = "Any value, e.g. makanmatch"))
	public ResponseEntity<Void> logout(@CookieValue(name = RefreshCookie.NAME, required = false) String refreshToken,
			@RequestHeader(name = CSRF_HEADER, required = false) String csrfHeader) {
		requireCsrfHeader(csrfHeader);
		auth.logout(refreshToken);
		return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookie.clear().toString()).build();
	}

	private ResponseEntity<SessionResponse> session(HttpStatus status, AuthResult result) {
		SupabaseSession session = result.session();
		MeResponse me = profiles.me(result.userId(), session.user().email(), null);
		SessionResponse body = new SessionResponse(session.accessToken(), "bearer", session.expiresIn(),
				session.expiresAt(), me);
		return ResponseEntity.status(status)
				.header(HttpHeaders.SET_COOKIE, cookie.issue(session.refreshToken()).toString())
				.body(body);
	}

	private ResponseEntity<ProblemDetail> signedOut(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, detail);
		problem.setType(URI.create("about:blank"));
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.header(HttpHeaders.SET_COOKIE, cookie.clear().toString())
				.body(problem);
	}

	private void throttle(String key) {
		if (!limiter.tryAcquire(key)) {
			throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
					"Too many attempts - try again in " + limiter.window().toMinutes() + " minutes");
		}
	}

	private static void requireCsrfHeader(String value) {
		if (value == null || value.isBlank()) {
			throw new ForbiddenException("Missing " + CSRF_HEADER + " header");
		}
	}

}
