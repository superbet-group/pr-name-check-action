import * as core from "@actions/core";
import * as github from "@actions/github";
import { PullsListReviewsResponseData } from '@octokit/types/dist-types/generated/Endpoints';

interface PullRequest {
  owner: string;
  repo: string;
  number: number;
}

const inputs = getInputs();
const githubClient = github.getOctokit(inputs.repoTokenInput);

async function run(): Promise<void> {
  const githubContext = github.context;
  const pullRequest = githubContext.issue;

  const joinedProjects = inputs.titleProjects.join("|");
  // Regex for `[XX-123] text` or `[YY-123] text` or `[fallback] text`
  const titleRegexInput = `\\[((${joinedProjects})\\-\\d+|${inputs.titleFallback})] .+`;
  const titleRegex = new RegExp(titleRegexInput);
  const title: string =
    (githubContext.payload.pull_request?.title as string) ?? "";

  const allowedFormats = [
    ...inputs.titleProjects.map((project) => `${project}-123`),
    inputs.titleFallback,
  ];
  const listOfFormats = allowedFormats
    .map((input) => `1. \`[${input}] text\``)
    .join("\n");
  const comment = inputs.onFailedRegexComment.replace(
    "%formats%",
    listOfFormats
  );

  core.debug(`Title Regex: ${titleRegex.source}`);
  core.debug(`Title: ${title}`);

  const titleMatchesRegex: boolean = titleRegex.test(title);
  if (!titleMatchesRegex) {
    await createReview(comment, pullRequest);
  } else {
    await dismissReview(pullRequest);
  }
}

function getInputs() {
  const repoTokenInput = core.getInput("repo-token", { required: true });
  const titleProjects: string = core.getInput("title-projects", {
    required: true,
  });
  const titleFallback: string = core.getInput("title-fallback", {
    required: true,
  });
  const onFailedRegexComment: string = core.getInput("on-failed-regex-comment");
  const onTitleCorrectedComment: string = core.getInput(
    "on-title-corrected-comment"
  );
  return {
    repoTokenInput,
    titleProjects: titleProjects.split("|"),
    titleFallback,
    onFailedRegexComment,
    onTitleCorrectedComment,
  };
}

async function createReview(
  comment: string,
  pullRequest: PullRequest,
) {
  const reviews = await getReviews(pullRequest);
  if (recentlyCommented(reviews)) {
    core.debug(`Recently commented!`);
    return;
  }
  core.debug(`Adding a new review`);
  void githubClient.pulls.createReview({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
    body: comment,
    event: "REQUEST_CHANGES",
  });
}

async function dismissReview(pullRequest: {
  owner: string;
  repo: string;
  number: number;
}) {
  const reviews = await getReviews(pullRequest);

  reviews.forEach((review) => {
    if (review.user.login == "github-actions[bot]") {
      void githubClient.pulls.dismissReview({
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        pull_number: pullRequest.number,
        review_id: review.id,
        message: inputs.onTitleCorrectedComment,
      });
    }
  });
}

async function getReviews(pullRequest: PullRequest): Promise<PullsListReviewsResponseData> {
  const response = await githubClient.pulls.listReviews({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
  });
  return response.data;
}
function recentlyCommented(reviews: PullsListReviewsResponseData) {
  const botReviews = reviews
      .filter(review => review.user.login == "github-actions[bot]");

  core.debug(`Bot reviews count: ${botReviews.length}`);

  botReviews.forEach(review => {
    core.debug(`Found review ${review.body}`);
  });
  return false;
}

run().catch((error) => {
  core.setFailed(error);
});
