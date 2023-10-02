const core = require('@actions/core')
const github = require('@actions/github')

async function run() {
  try {
    const token = core.getInput('token', { required: true })
    console.log('Token obtained:', !!token)

    const octokit = github.getOctokit(token)
    console.log('Octokit initialized:', !!octokit)

    const { owner, repo, number } = github.context.issue
    console.log(`Owner: ${owner}, Repo: ${repo}, PR Number: ${number}`)

    // Fetch the pull request to get the author's username
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: number
    })

    const prAuthor = pullRequest.user.login

    console.log(`PR Author: ${prAuthor}`)

    // Fetch existing review requests
    const { data: reviewRequests } =
      await octokit.rest.pulls.listRequestedReviewers({
        owner,
        repo,
        pull_number: number
      })

    const teams = reviewRequests.teams
    if (!teams.length) {
      console.log('No teams are assigned as reviewers.')
      return
    }

    console.log(`Teams assigned as reviewers: ${teams.map(team => team.slug)}`)

    // Collect individual members from the assigned teams
    const memberLogins = new Set()
    for (const team of teams) {
      console.log(
        `Attempting to fetch members for team slug: ${team.slug} in organization: ${owner}`
      )

      const { data: teamMembers } = await octokit.rest.teams.listMembersInOrg({
        org: owner,
        team_slug: team.slug
      })

      console.log(
        `Fetched ${teamMembers.length} members for team: ${team.slug}`
      )

      for (const member of teamMembers) {
        memberLogins.add(member.login)
      }
    }

    console.log(`Team members: ${Array.from(memberLogins).join(', ')}`)

    // Convert the Set back to an array and filter out the PR author
    const uniqueMemberLogins = Array.from(memberLogins).filter(
      login => login !== prAuthor
    )
    console.log(`Filtered team members: ${uniqueMemberLogins.join(', ')}`)

    // Remove teams from reviewers
    await octokit.rest.pulls.removeRequestedReviewers({
      owner,
      repo,
      pull_number: number,
      reviewers: [],
      team_reviewers: teams.map(team => team.slug)
    })

    // Add individual members as reviewers
    await octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: number,
      reviewers: uniqueMemberLogins
    })

    console.log(
      `Successfully replaced team reviewers with individual team members: ${uniqueMemberLogins.join(
        ', '
      )}`
    )
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`)
  }
}

run()
