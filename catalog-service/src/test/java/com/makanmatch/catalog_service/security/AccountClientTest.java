package com.makanmatch.catalog_service.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

class AccountClientTest {

	private HttpServer accountService;

	@AfterEach
	void stopAccountService() {
		if (accountService != null) accountService.stop(0);
	}

	// On Vercel an idle account-service is stopped and takes about 13 s to answer
	// its first request. Six seconds is enough to catch a client that gives up early
	// without making the suite wait out a full cold start.
	@Test
	void waitsForAnAccountServiceThatIsStillStarting() throws IOException {
		startAccountServiceAnsweringAfter(6_000,
				"{\"id\":\"user-1\",\"effectiveRole\":\"DINER\",\"ownedVenues\":[]}");
		AccountClient client = new AccountClient("http://localhost:" + accountService.getAddress().getPort());

		Optional<AccountClient.Me> me = client.me(new Caller(UUID.randomUUID(), "a-token", null));

		assertThat(me).map(AccountClient.Me::id).contains("user-1");
	}

	private void startAccountServiceAnsweringAfter(long delayMs, String json) throws IOException {
		accountService = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
		accountService.createContext("/api/me", exchange -> {
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
