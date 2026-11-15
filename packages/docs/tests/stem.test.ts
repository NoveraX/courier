/**
 * English stems, as the Porter2 algorithm gives them: the sample vocabulary
 * of the algorithm's description, word for word, and the rules it works
 * through — its exceptions, short words, a `y` that is a consonant, the
 * beginnings that set R1 — and the inflections the docs' searches meet.
 */
import { describe, expect, it } from "vitest";

import { stemOf } from "../src/stem";

/* Each word, then its stem. */
function pairs(text: string): [string, string][] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  return Array.from({ length: words.length / 2 }, (_, at) => [
    words[2 * at] ?? "",
    words[2 * at + 1] ?? "",
  ]);
}

const wrong = (text: string) => pairs(text).filter(([word, stem]) => stemOf(word) !== stem);

describe("stemOf", () => {
  it("gives the algorithm's sample vocabulary its stems", () => {
    expect(
      wrong(`
        consign consign consigned consign consigning consign consignment consign
        consist consist consisted consist consistency consist consistent consist
        consistently consist consisting consist consists consist consolation consol
        consolations consol consolatory consolatori console consol consoled consol
        consoles consol consolidate consolid consolidated consolid consolidating consolid
        consoling consol consolingly consol consols consol consonant conson consort consort
        consorted consort consorting consort conspicuous conspicu conspicuously conspicu
        conspiracy conspiraci conspirator conspir conspirators conspir conspire conspir
        conspired conspir conspiring conspir constable constabl constables constabl
        constance constanc constancy constanc constant constant
        knack knack knackeries knackeri knacks knack knag knag knave knave knaves knave
        knavish knavish kneaded knead kneading knead knee knee kneel kneel kneeled kneel
        kneeling kneel kneels kneel knees knee knell knell knelt knelt knew knew knick knick
        knif knif knife knife knight knight knightly knight knights knight knit knit
        knits knit knitted knit knitting knit knives knive knob knob knobs knob knock knock
        knocked knock knocker knocker knockers knocker knocking knock knocks knock
        knopp knopp knot knot knots knot`),
    ).toEqual([]);
  });

  it("follows the rules the algorithm's description works through", () => {
    expect(
      wrong(`
        skies sky skis ski dying die news news only onli early earli inning inning
        proceed proceed succeeded succeed by by ab ab ties tie cries cri gas gas gaps gap
        kiwis kiwi hoping hope hopping hop luxuriated luxuri cry cri say say agreed agre
        generate generat general general generous generous generously generous
        communism communism arsenal arsenal yes yes sayyid sayyid employed employ`),
    ).toEqual([]);
  });

  it("comes to one stem for the inflections a search meets", () => {
    expect(
      wrong(`
        map map maps map mapped map mapping map cancelled cancel cancelling cancel
        cancellation cancel retries retri retried retri retrying retri validate valid
        validated valid validation valid validator valid uploads upload uploading upload
        cached cach caching cach responses respons v2 v2 4401 4401`),
    ).toEqual([]);
  });
});
