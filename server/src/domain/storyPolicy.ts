/** Disclosures belong in Terms, never in the playable story. */
export function containsStoryDisclosure(text: string): boolean {
  return /\b(based on (?:a |the )?(?:true|real) (?:story|events?|case)|this (?:case|story) is (?:entirely |purely )?fictional|all (?:characters|events|people) (?:are|in this .{0,20} are) fictional|as an ai|ai[- ]generated (?:case|story))\b/i.test(text);
}
