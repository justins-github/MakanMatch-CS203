// Logging out: the server ends the session first, then this page forgets it.
// The order matters on a shared computer. The refresh cookie can't be cleared from
// the page, so if the server call failed and we showed the login screen anyway, the
// next reload would sign this person back in. So a failure is thrown and nothing is
// cleared; the caller says so and the person tries again.
// `force` is for an account that was just deleted: its cookie can't sign anyone in.
export async function signOut({ endSession, clearLocal, force = false }) {
  try {
    await endSession()
  } catch (err) {
    if (!force) throw err
  }
  clearLocal()
}
