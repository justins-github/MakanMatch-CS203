package com.makanmatch.account_service.profile;

import java.util.Collection;
import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * What someone can't eat and what they'd rather eat. Restrictions are hard
 * rules (never recommend these); preferences and spice level are leanings.
 * The option lists must match the checks in V4__add_dietary_needs.sql.
 *
 * @param spiceLevel null when the person hasn't said
 */
public record DietaryNeeds(Set<Restriction> restrictions, Set<Preference> preferences, SpiceLevel spiceLevel) {

	/** Must not eat, for religious, ethical or medical reasons. */
	public enum Restriction {
		HALAL, VEGETARIAN, VEGAN, NO_PORK, NO_BEEF,
		NUT_ALLERGY, SHELLFISH_ALLERGY, DAIRY_FREE, GLUTEN_FREE, EGG_ALLERGY
	}

	/** Would rather have. */
	public enum Preference {
		HEALTHIER, LESS_OILY, LESS_SWEET, LOW_CARB
	}

	public enum SpiceLevel {
		NONE, MILD, MEDIUM, HOT
	}

	/** A missing list means none; lists always come out in option order. */
	public DietaryNeeds {
		restrictions = inOptionOrder(Restriction.class, restrictions);
		preferences = inOptionOrder(Preference.class, preferences);
	}

	private static <E extends Enum<E>> Set<E> inOptionOrder(Class<E> type, Collection<E> values) {
		EnumSet<E> set = EnumSet.noneOf(type);
		if (values != null) set.addAll(values);
		return Collections.unmodifiableSet(set);
	}
}
