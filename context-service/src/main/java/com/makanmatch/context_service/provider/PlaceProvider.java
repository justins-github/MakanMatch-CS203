package com.makanmatch.context_service.provider;

import com.makanmatch.context_service.DTO.PlaceDto;

import java.util.List;

public interface PlaceProvider {
    List<PlaceDto> getPlaces();
}
