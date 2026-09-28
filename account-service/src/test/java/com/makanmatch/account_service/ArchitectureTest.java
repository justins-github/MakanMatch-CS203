package com.makanmatch.account_service;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

import org.springframework.data.repository.Repository;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

/**
 * The layering rules, checked on every build:
 * controllers -> services -> repositories, features never depend on each other
 * in a circle, and the shared "common" package depends on no feature.
 */
@AnalyzeClasses(packages = "com.makanmatch.account_service", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

	private static final String ROOT = "com.makanmatch.account_service";

	@ArchTest
	static final ArchRule featurePackagesAreFreeOfCycles =
			slices().matching(ROOT + ".(*)..").should().beFreeOfCycles();

	@ArchTest
	static final ArchRule controllersGoThroughServices =
			noClasses().that().areAnnotatedWith(RestController.class)
					.should().dependOnClassesThat().areAssignableTo(Repository.class);

	@ArchTest
	static final ArchRule servicesKnowNothingAboutHttp =
			noClasses().that().areAnnotatedWith(Service.class)
					.should().dependOnClassesThat().resideInAnyPackage(
							"jakarta.servlet..", "org.springframework.web.bind.annotation..");

	@ArchTest
	static final ArchRule commonDependsOnNoFeature =
			noClasses().that().resideInAPackage(ROOT + ".common..")
					.should().dependOnClassesThat().resideInAnyPackage(
							ROOT + ".admin..", ROOT + ".auth..", ROOT + ".claim..", ROOT + ".config..",
							ROOT + ".owner..", ROOT + ".profile..", ROOT + ".security..", ROOT + ".supabase..");

	@ArchTest
	static final ArchRule onlyTheSupabasePackageTalksToSupabaseDirectly =
			noClasses().that().resideOutsideOfPackages(ROOT + ".supabase..")
					.should().dependOnClassesThat().haveFullyQualifiedName("org.springframework.web.client.RestClient");
}
