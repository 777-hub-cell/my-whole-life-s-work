// This provider is intentionally disabled: its catalogue does not establish
// distribution rights for individual titles.
export default {
  id:'welib',
  name:'WeLib (disabled)',
  description:'Disabled because distribution rights for catalogue files cannot be verified.',
  disabled:true,
  async run() {
    throw new Error('WeLib is disabled because distribution rights for its files cannot be verified. Use an authorized or public-domain source.')
  },
}
