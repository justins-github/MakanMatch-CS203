package com.makanmatch.catalog_service.security;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Optional;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Whose certificates a call to another service accepts. On Vercel a service's
 * address is HTTPS and answered with a certificate from Vercel's own authority.
 * Vercel hands that authority to the container as a PEM file (SSL_CERT_FILE);
 * Node and Python read the variable by themselves, Java does not, so without
 * this every call to account-service fails its TLS handshake before anything
 * is sent.
 */
final class PlatformCertificates {

	private static final Logger log = LoggerFactory.getLogger(PlatformCertificates.class);

	private PlatformCertificates() {
	}

	/**
	 * Java's own trusted certificates plus those in the PEM file; empty (Java's own
	 * only) when no file is named or it can't be read, which is logged.
	 */
	static Optional<SSLContext> trusting(String pemBundle) {
		if (pemBundle == null || pemBundle.isBlank()) return Optional.empty();
		try (InputStream pem = Files.newInputStream(Path.of(pemBundle))) {
			KeyStore trusted = KeyStore.getInstance(KeyStore.getDefaultType());
			trusted.load(null, null);
			int count = 0;
			for (X509Certificate certificate : javasOwn()) {
				trusted.setCertificateEntry("java-" + count++, certificate);
			}
			int added = 0;
			for (Certificate certificate : CertificateFactory.getInstance("X.509").generateCertificates(pem)) {
				trusted.setCertificateEntry("platform-" + added++, certificate);
			}
			TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
			factory.init(trusted);
			SSLContext context = SSLContext.getInstance("TLS");
			context.init(null, factory.getTrustManagers(), null);
			log.info("also trusting the {} certificates in {}", added, pemBundle);
			return Optional.of(context);
		}
		catch (IOException | GeneralSecurityException | RuntimeException e) {
			log.warn("could not use the certificate bundle at {}; trusting Java's own certificates only", pemBundle, e);
			return Optional.empty();
		}
	}

	private static X509Certificate[] javasOwn() throws GeneralSecurityException {
		TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
		factory.init((KeyStore) null);
		for (TrustManager manager : factory.getTrustManagers()) {
			if (manager instanceof X509TrustManager x509) return x509.getAcceptedIssuers();
		}
		return new X509Certificate[0];
	}
}
