import * as core from "@actions/core";
import * as github from "@actions/github";

const GITHUB_BOT_NAME = "github-actions[bot]";

const inputs = getInputs();
const githubClient = new github.GitHub(inputs.repoTokenInput);

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
  pullRequest: { owner: string; repo: string; number: number }
) {
  const reviews = await githubClient.pulls.listReviews({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
  });

  reviews.data.forEach((review) => {
    if (review.user.login == GITHUB_BOT_NAME) {
      void githubClient.pulls.deletePendingReview({
        owner: pullRequest.owner,
        repo: pullRequest.repo,
        pull_number: pullRequest.number,
        review_id: review.id,
      });
    }
  });

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
  const reviews = await githubClient.pulls.listReviews({
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    pull_number: pullRequest.number,
  });

  reviews.data.forEach((review) => {
    if (review.user.login == GITHUB_BOT_NAME) {
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

run().catch((error) => {
  core.setFailed(error);
});
