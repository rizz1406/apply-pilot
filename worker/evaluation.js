import { scoreJob } from "./matching.js";

export const MATCHING_FIXTURES = [
  { expected: true, job: { title: "Data Analyst", company: "Example", location: "Hyderabad", description: "Build SQL and BigQuery reporting, dashboards, ETL and data quality workflows.", salaryText: "8 LPA" } },
  { expected: true, job: { title: "BI Analyst", company: "Example", location: "Remote India", description: "Create Power BI dashboards using SQL, Excel and analytics data.", salaryText: "9 LPA" } },
  { expected: true, job: { title: "Junior Data Engineer", company: "Example", location: "Hyderabad", description: "Maintain Python, SQL, GCP and ETL pipelines. One to two years experience.", salaryText: "10 LPA" } },
  { expected: false, job: { title: "Senior Java Engineer", company: "Example", location: "Hyderabad", description: "Seven years Java, Spring and Kubernetes experience required.", salaryText: "20 LPA" } },
  { expected: false, job: { title: "Field Sales Executive", company: "Example", location: "Delhi", description: "Commission sales role requiring travel and cold calling.", salaryText: "5 LPA" } },
  { expected: false, job: { title: "Data Analyst", company: "Example", location: "United States", description: "Onsite role. US work authorization required. No sponsorship.", salaryText: "$90,000" } }
];

export function runMatchingEvaluation(settings, fixtures = MATCHING_FIXTURES) {
  let truePositives = 0, trueNegatives = 0, falsePositives = 0, falseNegatives = 0;
  const details = fixtures.map(fixture => {
    const result = scoreJob(fixture.job, settings);
    const predicted = Boolean(result.eligible) && result.score >= Number(settings.minimum_match_score || 50);
    if (predicted && fixture.expected) truePositives += 1;
    else if (!predicted && !fixture.expected) trueNegatives += 1;
    else if (predicted) falsePositives += 1;
    else falseNegatives += 1;
    return { title: fixture.job.title, expected: fixture.expected, predicted, score: result.score, reasons: result.reasons };
  });
  const total = fixtures.length;
  const passed = truePositives + trueNegatives;
  return {
    total, passed, accuracy: Math.round(passed / total * 100),
    precision: truePositives ? Math.round(truePositives / (truePositives + falsePositives) * 100) : 0,
    recall: truePositives ? Math.round(truePositives / (truePositives + falseNegatives) * 100) : 0,
    falsePositives, falseNegatives, details
  };
}
