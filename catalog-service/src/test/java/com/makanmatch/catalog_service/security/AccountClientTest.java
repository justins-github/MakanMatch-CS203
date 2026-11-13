package com.makanmatch.catalog_service.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import com.makanmatch.catalog_service.common.UpstreamUnavailableException;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;

@ExtendWith(OutputCaptureExtension.class)
class AccountClientTest {

	private static final String ME = "{\"id\":\"user-1\",\"effectiveRole\":\"USER\",\"ownedVenues\":[]}";
	private static final String NO_BUNDLE = "";
	private static final char[] PASSWORD = "changeit".toCharArray();

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
		startAccountService(HttpServer.create(new InetSocketAddress("localhost", 0), 0), 6_000);

		Optional<AccountClient.Me> me = new AccountClient(address("http"), NO_BUNDLE).me(caller());

		assertThat(me).map(AccountClient.Me::id).contains("user-1");
	}

	// The engine reaches account-service over the same kind of address with plain
	// HTTP/1.1. Java's client asks to switch to HTTP/2 unless told not to, which is
	// one more thing for the platform's internal routing to get wrong.
	@Test
	void asksOverPlainHttp11LikeTheEngineDoes() throws IOException {
		startAccountService(HttpServer.create(new InetSocketAddress("localhost", 0), 0), 0);

		new AccountClient(address("http"), NO_BUNDLE).me(caller());

		assertThat(asked).hasSize(1);
		assertThat(asked.get(0).getFirst("Upgrade")).isNull();
		assertThat(asked.get(0).getFirst("HTTP2-Settings")).isNull();
	}

	// "Account service is unreachable" is all the diner sees, so the log has to say
	// where the call went and what actually went wrong.
	@Test
	void anUnreachableAccountServiceIsLoggedWithWhereAndWhy(CapturedOutput output) throws IOException {
		String nobodyHome = "http://localhost:" + freePort();

		assertThatThrownBy(() -> new AccountClient(nobodyHome, NO_BUNDLE).me(caller()))
				.isInstanceOf(UpstreamUnavailableException.class)
				.hasMessage("Account service is unreachable");

		assertThat(output).contains(nobodyHome).contains("ConnectException");
	}

	// What broke adding a dish on Vercel. There, account-service's address is HTTPS
	// and answered with a certificate from Vercel's own authority, which Java has
	// never heard of. Vercel supplies that authority as a PEM file (SSL_CERT_FILE);
	// Node reads it unasked, Java has to be handed it.
	@Test
	void anAccountServiceBehindThePlatformsOwnCertificateIsRefusedWithoutItsBundle(@TempDir Path dir,
			CapturedOutput output) throws Exception {
		startAccountServiceWithItsOwnCertificate(dir);

		assertThatThrownBy(() -> new AccountClient(address("https"), NO_BUNDLE).me(caller()))
				.isInstanceOf(UpstreamUnavailableException.class);

		assertThat(output).contains("SSLHandshakeException");
		assertThat(asked).isEmpty();
	}

	@Test
	void anAccountServiceBehindThePlatformsOwnCertificateAnswersOnceGivenItsBundle(@TempDir Path dir)
			throws Exception {
		Path bundle = startAccountServiceWithItsOwnCertificate(dir);

		Optional<AccountClient.Me> me = new AccountClient(address("https"), bundle.toString()).me(caller());

		assertThat(me).map(AccountClient.Me::id).contains("user-1");
	}

	// A bundle that names a missing file must not stop the service from starting.
	@Test
	void aBundleThatCannotBeReadIsLoggedAndTheServiceCarriesOn(@TempDir Path dir, CapturedOutput output)
			throws IOException {
		startAccountService(HttpServer.create(new InetSocketAddress("localhost", 0), 0), 0);
		Path missing = dir.resolve("no-such-bundle.pem");

		Optional<AccountClient.Me> me = new AccountClient(address("http"), missing.toString()).me(caller());

		assertThat(me).map(AccountClient.Me::id).contains("user-1");
		assertThat(output).contains("no-such-bundle.pem");
	}

	private String address(String scheme) {
		return scheme + "://localhost:" + accountService.getAddress().getPort();
	}

	private static Caller caller() {
		return new Caller(UUID.randomUUID(), "a-token", null);
	}

	private static int freePort() throws IOException {
		try (ServerSocket socket = new ServerSocket(0)) {
			return socket.getLocalPort();
		}
	}

	private void startAccountService(HttpServer server, long delayMs) {
		accountService = server;
		accountService.createContext("/api/me", exchange -> {
			asked.add(exchange.getRequestHeaders());
			try {
				Thread.sleep(delayMs);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			byte[] body = ME.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		});
		accountService.start();
	}

	/**
	 * An HTTPS account-service whose certificate no one has heard of, made for this
	 * test with the JDK's keytool. Returns that certificate as a PEM bundle.
	 */
	private Path startAccountServiceWithItsOwnCertificate(Path dir) throws Exception {
		Path keystore = dir.resolve("account-service.p12");
		Path bundle = dir.resolve("platform-ca.pem");
		keytool("-genkeypair", "-alias", "account", "-keyalg", "RSA", "-keysize", "2048", "-validity", "2",
				"-dname", "CN=localhost", "-ext", "san=dns:localhost", "-storetype", "PKCS12",
				"-keystore", keystore.toString(), "-storepass", new String(PASSWORD));
		keytool("-exportcert", "-rfc", "-alias", "account", "-keystore", keystore.toString(),
				"-storepass", new String(PASSWORD), "-file", bundle.toString());

		KeyStore keys = KeyStore.getInstance("PKCS12");
		try (InputStream in = Files.newInputStream(keystore)) {
			keys.load(in, PASSWORD);
		}
		KeyManagerFactory keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
		keyManagers.init(keys, PASSWORD);
		SSLContext tls = SSLContext.getInstance("TLS");
		tls.init(keyManagers.getKeyManagers(), null, null);

		HttpsServer server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
		server.setHttpsConfigurator(new HttpsConfigurator(tls));
		startAccountService(server, 0);
		return bundle;
	}

	private static void keytool(String... args) throws IOException, InterruptedException {
		List<String> command = new ArrayList<>();
		command.add(Path.of(System.getProperty("java.home"), "bin", "keytool").toString());
		command.addAll(List.of(args));
		Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
		String said = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
		assertThat(process.waitFor()).as("keytool %s: %s", List.of(args), said).isZero();
	}
}
