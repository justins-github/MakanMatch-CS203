package com.makanmatch.context_service.service;

/** Great-circle distance in metres between two latitude/longitude pairs. */
public final class HaversineCalculator {
    private static final double EARTH_RADIUS_METRES = 6_371_008.8;

    private HaversineCalculator() {}

    public static double distanceMetres(double lat1, double lng1, double lat2, double lng2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaPhi = Math.toRadians(lat2 - lat1);
        double deltaLambda = Math.toRadians(lng2 - lng1);
        double sinHalfPhi = Math.sin(deltaPhi / 2.0);
        double sinHalfLambda = Math.sin(deltaLambda / 2.0);
        double a = sinHalfPhi * sinHalfPhi
                + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;
        double centralAngle = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return EARTH_RADIUS_METRES * centralAngle;
    }
}
