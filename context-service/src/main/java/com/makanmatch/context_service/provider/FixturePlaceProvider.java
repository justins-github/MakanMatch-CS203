package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.PlaceDto;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@Profile("test")
@ConditionalOnProperty(name = "places.provider", havingValue = "fixture")
public class FixturePlaceProvider implements PlaceProvider {
    private static final List<PlaceDto> PLACES = List.of(
            new PlaceDto("sg-001", "Lau Pa Sat", 1.2806, 103.8501),
            new PlaceDto("sg-002", "Maxwell Food Centre", 1.2803, 103.8448),
            new PlaceDto("sg-003", "Chinatown Complex Food Centre", 1.2820, 103.8430),
            new PlaceDto("sg-004", "Amoy Street Food Centre", 1.2798, 103.8467),
            new PlaceDto("sg-005", "Tiong Bahru Market", 1.2858, 103.8329),
            new PlaceDto("sg-006", "Newton Food Centre", 1.3115, 103.8392),
            new PlaceDto("sg-007", "Tekka Centre", 1.3066, 103.8518),
            new PlaceDto("sg-008", "Albert Centre Market", 1.3014, 103.8545),
            new PlaceDto("sg-009", "Old Airport Road Food Centre", 1.3081, 103.8850),
            new PlaceDto("sg-010", "East Coast Lagoon Food Village", 1.3068, 103.9342),
            new PlaceDto("sg-011", "Chomp Chomp Food Centre", 1.3640, 103.8662),
            new PlaceDto("sg-012", "Newton Circus", 1.3115, 103.8390),
            new PlaceDto("sg-013", "Golden Mile Food Centre", 1.3024, 103.8636),
            new PlaceDto("sg-014", "Hong Lim Market", 1.2851, 103.8466),
            new PlaceDto("sg-015", "Adam Road Food Centre", 1.3240, 103.8140),
            new PlaceDto("sg-016", "Geylang Serai Market", 1.3163, 103.8973),
            new PlaceDto("sg-017", "Bedok Interchange Hawker Centre", 1.3243, 103.9302),
            new PlaceDto("sg-018", "Jurong West 505 Market", 1.3498, 103.7188),
            new PlaceDto("sg-019", "Tampines Round Market", 1.3531, 103.9451),
            new PlaceDto("sg-020", "Yuhua Village Market", 1.3437, 103.7401),
            new PlaceDto("sg-021", "Bukit Timah Market", 1.3394, 103.7750),
            new PlaceDto("sg-022", "Chinatown Point", 1.2845, 103.8448),
            new PlaceDto("sg-023", "Raffles City", 1.2936, 103.8530),
            new PlaceDto("sg-024", "ION Orchard", 1.3040, 103.8318),
            new PlaceDto("sg-025", "VivoCity", 1.2644, 103.8222),
            new PlaceDto("sg-026", "Jewel Changi Airport", 1.3602, 103.9897),
            new PlaceDto("sg-027", "NEX", 1.3508, 103.8723),
            new PlaceDto("sg-028", "Causeway Point", 1.4369, 103.7865),
            new PlaceDto("sg-029", "Westgate", 1.3343, 103.7422),
            new PlaceDto("sg-030", "HarbourFront Centre", 1.2653, 103.8215)
    );

    @Override
    public List<PlaceDto> getPlaces() {
        return PLACES;
    }
}
