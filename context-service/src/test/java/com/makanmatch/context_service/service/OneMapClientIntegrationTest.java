package com.makanmatch.context_service.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.makanmatch.context_service.DTO.WalkRouteDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cache.CacheManager;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class OneMapClientIntegrationTest {

    private static final double NOVENA_LAT = 1.3521;
    private static final double NOVENA_LNG = 103.8198;
    private static final double RAFFLES_LAT = 1.2966;
    private static final double RAFFLES_LNG = 103.8520;

    @Autowired
    OneMapClient oneMapClient;

    @Autowired
    CacheManager cacheManager;

    private ListAppender<ILoggingEvent> routeLogAppender;
    private ListAppender<ILoggingEvent> tokenLogAppender;

    @BeforeEach
    void setUp() {
        cacheManager.getCache("walkRoutes").clear();

        routeLogAppender = attachAppender(OneMapClient.class);
        tokenLogAppender = attachAppender(OneMapTokenManager.class);
    }

    @Test
    void getWalkRoute_returnsTimeAndDistanceMatchingOneMapApi() {
        WalkRouteDto route = oneMapClient.getWalkRoute(NOVENA_LAT, NOVENA_LNG, RAFFLES_LAT, RAFFLES_LNG);

        assertThat(route.totalTimeSeconds()).isEqualTo(6905L);
        assertThat(route.totalDistanceMetres()).isEqualTo(9589L);
    }

    @Test
    void getWalkRoute_secondCallWithinCacheWindowDoesNotHitOneMap() {
        oneMapClient.getWalkRoute(NOVENA_LAT, NOVENA_LNG, RAFFLES_LAT, RAFFLES_LNG);
        routeLogAppender.list.clear();

        WalkRouteDto cached = oneMapClient.getWalkRoute(NOVENA_LAT, NOVENA_LNG, RAFFLES_LAT, RAFFLES_LNG);

        assertThat(cached.totalTimeSeconds()).isEqualTo(6905L);
        assertThat(cached.totalDistanceMetres()).isEqualTo(9589L);
        assertThat(routeLogAppender.list).isEmpty();
    }

    @Test
    void getWalkRoute_fetchesTokenOncePerTestRun() {
        oneMapClient.getWalkRoute(NOVENA_LAT, NOVENA_LNG, RAFFLES_LAT, RAFFLES_LNG);
        tokenLogAppender.list.clear();

        oneMapClient.getWalkRoute(NOVENA_LAT + 0.0001, NOVENA_LNG, RAFFLES_LAT, RAFFLES_LNG);

        assertThat(tokenLogAppender.list).isEmpty();
    }

    private static ListAppender<ILoggingEvent> attachAppender(Class<?> source) {
        Logger logger = (Logger) LoggerFactory.getLogger(source);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        logger.setLevel(Level.INFO);
        return appender;
    }
}
