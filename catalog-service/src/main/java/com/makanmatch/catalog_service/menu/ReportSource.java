package com.makanmatch.catalog_service.menu;

/** Who a dish or a price came from. The source decides how much it is trusted. */
public enum ReportSource {
	/** The venue's verified owner: the official menu. */
	OWNER,
	/** A diner who ate there: community knowledge. */
	DINER,
	/** Curated demo data loaded by scripts/seed-menus.mjs. */
	SEED
}
