package com.makanmatch.catalog_service.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.makanmatch.catalog_service.common.UpstreamUnavailableException;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;

@ExtendWith(OutputCaptureExtension.class)
class AccountClientTest {

	private static final String ME = "{\"id\":\"user-1\",\"effectiveRole\":\"USER\",\"ownedVenues\":[]}";

	private HttpServer accountService;
	private final List<Headers> asked = new CopyOnWriteArrayList<>();

	@AfterEach
	void stopAccountService() {
		if (accountService != null) accountService.stop(0);
	}

	// On Vercel an idle account-service is stopped and takes about 13 s to answer
	// its first request. Six seconds is enough to catch a client that gives up early
	// without making the suite wait out a full cold start.
	@Test
	void waitsForAnAccountServiceThatIsStillStarting() throws IOException {
		startAccountServiceAnsweringAfter(6_000, ME);

		Optional<AccountClient.Me> me = client().me(caller());

		assertThat(me).map(AccountClient.Me::id).contains("user-1");
	}

	// The engine reaches account-service over the same kind of address with plain
	// HTTP/1.1. Java's client asks to switch to HTTP/2 unless told not to, which is
	// one more thing for the platform's internal routing to get wrong.
	@Test
	void asksOverPlainHttp11LikeTheEngineDoes() throws IOException {
		startAccountServiceAnsweringAfter(0, ME);

		client().me(caller());

		assertThat(asked).hasSize(1);
		assertThat(asked.get(0).getFirst("Upgrade")).isNull();
		assertThat(asked.get(0).getFirst("HTTP2-Settings")).isNull();
	}

	// "Account service is unreachable" is all the diner sees, so the log has to say
	// where the call went and what actually went wrong.
	@Test
	void anUnreachableAccountServiceIsLoggedWithWhereAndWhy(CapturedOutput output) throws IOException {
		String nobodyHome = "http://localhost:" + freePort();

		assertThatThrownBy(() -> new AccountClient(nobodyHome).me(caller()))
				.isInstanceOf(UpstreamUnavailableException.class)
				.hasMessage("Account service is unreachable");

		assertThat(output).contains(nobodyHome).contains("ConnectException");
	}

	private AccountClient client() {
		return new AccountClient("http://localhost:" + accountService.getAddress().getPort());
	}

	private static Caller caller() {
		return new Caller(UUID.randomUUID(), "a-token", null);
	}

	private static int freePort() throws IOException {
		try (ServerSocket socket = new ServerSocket(0)) {
			return socket.getLocalPort();
		}
	}

	private void startAccountServiceAnsweringAfter(long delayMs, String json) throws IOException {
		accountService = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
		accountService.createContext("/api/me", exchange -> {
			asked.add(exchange.getRequestHeaders());
			try {
				Thread.sleep(delayMs);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			byte[] body = json.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		});
		accountService.start();
	}
}
