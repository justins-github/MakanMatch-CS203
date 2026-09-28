package com.makanmatch.context_service.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class HaversineCalculatorTest {
    @Test
    void calculatesOneDegreeOfLatitudeAtEquator() {
        assertWithinOnePercent(HaversineCalculator.distanceMetres(0, 0, 1, 0), 111_195.1);
    }

    @Test
    void calculatesOneDegreeOfLongitudeAtEquator() {
        assertWithinOnePercent(HaversineCalculator.distanceMetres(0, 0, 0, 1), 111_195.1);
    }

    private static void assertWithinOnePercent(double actual, double expected) {
        assertThat(actual).isBetween(expected * 0.99, expected * 1.01);
    }
}
