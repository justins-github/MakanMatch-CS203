package com.makanmatch.catalog_service.menu;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One reported price. Append-only: a new price is a new row, so history is kept. */
@Entity
@Table(name = "dish_prices")
public class DishPrice {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "dish_id", nullable = false)
	private String dishId;

	@Column(name = "price", nullable = false, precision = 8, scale = 2)
	private BigDecimal price;

	@Enumerated(EnumType.STRING)
	@Column(name = "source", nullable = false)
	private ReportSource source;

	@Column(name = "reported_by")
	private UUID reportedBy;

	@Column(name = "reported_at", nullable = false, updatable = false)
	private Instant reportedAt;

	protected DishPrice() {
	}

	public DishPrice(String dishId, BigDecimal price, ReportSource source, UUID reportedBy) {
		this(dishId, price, source, reportedBy, Instant.now());
	}

	DishPrice(String dishId, BigDecimal price, ReportSource source, UUID reportedBy, Instant reportedAt) {
		this.dishId = dishId;
		this.price = price;
		this.source = source;
		this.reportedBy = reportedBy;
		this.reportedAt = reportedAt;
	}

	public Long getId() {
		return id;
	}

	public String getDishId() {
		return dishId;
	}

	public BigDecimal getPrice() {
		return price;
	}

	public ReportSource getSource() {
		return source;
	}

	public UUID getReportedBy() {
		return reportedBy;
	}

	public Instant getReportedAt() {
		return reportedAt;
	}
}
