export function parseComicFilename(filename: string, seriesTitle?: string) {
  // 1. Strip extension
  let cleanName = filename.replace(/\.(cbr|cbz|rar|zip|pdf|epub)$/i, '');

  // 2. Extract Year (4 digits in parentheses or brackets) e.g., (2014) or [2014]
  let yearMatch = cleanName.match(/[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]/);
  let year = yearMatch ? yearMatch[1] : undefined;

  // 3. Strip all bracketed/parenthetical metadata tags from the right/everywhere
  // e.g., (digital), (Son of Ultron-Empire), [1080p], (c2c)
  cleanName = cleanName.replace(/[\(\[].*?[\)\]]/g, ' ').trim();

  // 4. Strip the Series Title from the filename (if provided)
  // This prevents numbers inside the series title (e.g. "Injustice 2") from being picked up as issue numbers
  if (seriesTitle) {
    // Escape regex characters in series title
    const escapedTitle = seriesTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`^\\s*${escapedTitle}\\s*[-_:]*\\s*`, 'i');
    cleanName = cleanName.replace(titleRegex, '');
  }

  // 5. Strip volume indicators that aren't issue numbers (e.g. v2, Vol 3, Vol. 4)
  cleanName = cleanName.replace(/\b(?:v|vol|volume)\.?\s*\d+\b/gi, ' ');

  // 6. Extract the issue number
  // Look for standalone numbers, `#` numbers, Annuals, decimals.
  // We want the *last* standalone number if multiple exist, as it's typically the issue number.
  let issueStr = '';
  
  // Try to match "Annual 1" or similar
  const annualMatch = cleanName.match(/(?:annual|special)\s*(?:#)?\s*(\d+(?:\.\d+)?)/i);
  if (annualMatch) {
    issueStr = annualMatch[1];
    return { issue: issueStr, year, isAnnual: true };
  }

  // Match standalone numbers: " 003 ", " #003 ", " 1.5 ", " #12.AU "
  // We match globally and take the last match.
  const numberMatches = [...cleanName.matchAll(/(?:#)?(\d+(?:\.\w+)?)/g)];
  if (numberMatches.length > 0) {
    // Take the last number match
    let rawNum = numberMatches[numberMatches.length - 1][1];
    
    // Parse integer to strip leading zeros if it's purely numeric
    if (/^\d+$/.test(rawNum)) {
      issueStr = parseInt(rawNum, 10).toString();
    } else {
      // For decimals/alphanumeric like "1.5" or "12.AU"
      const floatVal = parseFloat(rawNum);
      if (!isNaN(floatVal) && rawNum.includes('.')) {
         // handle 001.5 -> 1.5
         issueStr = rawNum.replace(/^0+/, '');
         if (issueStr.startsWith('.')) issueStr = '0' + issueStr;
      } else {
         issueStr = rawNum.replace(/^0+/, '');
      }
    }
  } else {
     // fallback if no numbers found
     issueStr = cleanName.trim();
  }

  return { issue: issueStr, year, isAnnual: false };
}

export function cleanComicDescription(rawHtml: string): string {
  if (!rawHtml) return '';
  let text = rawHtml;

  // 1. Strip tables (which often contain creator credits)
  text = text.replace(/<table\b[^>]*>(.*?)<\/table>/gi, '');

  // 2. Strip wiki-entity-table divs
  text = text.replace(/<div\b[^>]*class=["'][^"']*wiki-entity-table[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Strip common credit lines (e.g. "Writer: Tom King", "<strong>Pencils:</strong>")
  const creditRegex = /<p>.*?(?:Writer|Written by|Artist|Art by|Penciller|Pencils|Inker|Inks|Colorist|Colors|Letterer|Letters|Cover|Editor)\s*:.*?<\/p>/gi;
  text = text.replace(creditRegex, '');

  // 4. Strip headings that typically precede credits
  text = text.replace(/<h[1-6]>.*?(?:Creators|Credits|Publishing).*?<\/h[1-6]>/gi, '');

  // 5. Clean up empty paragraphs or line breaks left behind
  text = text.replace(/<p>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/p>/gi, '');

  return text.trim();
}

export function extractTeaser(deck?: string | null, description?: string | null): string {
  if (deck && deck.trim()) {
    return deck.trim();
  }
  if (!description) return '';

  const cleaned = cleanComicDescription(description);
  // Strip all HTML tags
  const plain = cleaned.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!plain) return '';

  // Grab the first 1-2 sentences (roughly up to 260 chars)
  const sentenceMatch = plain.match(/^.*?[.!?](?:\s+.*?[.!?])?/);
  if (sentenceMatch && sentenceMatch[0] && sentenceMatch[0].length >= 30 && sentenceMatch[0].length <= 280) {
    return sentenceMatch[0].trim();
  }

  // Fallback: first 180 characters trimmed nicely at word boundary
  if (plain.length <= 180) return plain;
  return plain.slice(0, 180).replace(/\s+\S*$/, '') + '...';
}

