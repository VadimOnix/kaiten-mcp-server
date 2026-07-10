export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // semantic-release commit bodies (release notes) can be long
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
