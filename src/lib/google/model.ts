// Honor the model configured for the group's key. Availability is account
// specific; never silently substitute another model or billing profile.
export function configuredGeminiModel(value?: string | null): string | null {
    return value?.trim() || null;
}
