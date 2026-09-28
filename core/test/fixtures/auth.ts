export const HOME_HTML = `<!doctype html><html><head><title>MyDy</title></head><body>
<form action="/index.php" method="post">
  <input type="text" name="username">
  <input type="hidden" name="wantsurl" value="">
  <button type="submit" name="next" value="Next">Next</button>
</form>
</body></html>`

export const LOGIN_FORM_HTML = `<!doctype html><html><head><title>MyDy: Log in to the site</title></head><body>
<form class="search" action="/rait/course/search.php"><input type="hidden" name="sesskey" value="zzz"></form>
<form id="login" action="index.php" method="post">
  <input type="hidden" name="logintoken" value="tok123">
  <input type="hidden" name="username" value="student@dypatil.edu">
  <input type="password" name="password" id="password" value="">
  <button type="submit" id="loginbtn">Log in</button>
</form>
</body></html>`

export const LOGIN_FAILED_HTML = LOGIN_FORM_HTML.replace(
  '<form id="login"',
  '<div class="alert alert-danger" role="alert">Invalid login, please try again</div>\n<form id="login"',
)

export const DASHBOARD_HTML = `<!doctype html><html><head><title>Dashboard</title></head><body>
<a href="/rait/login/logout.php?sesskey=zzz">Log out</a>
<div class="block block_navigation"><ul>
  <li><a href="https://mydy.dypatil.edu/rait/course/view.php?id=812">Data Structures and Algorithms</a></li>
  <li><a href="/rait/course/view.php?id=815">Computer Networks</a></li>
  <li><a href="/rait/course/view.php?id=811">Engineering Maths III</a></li>
  <li><a href="/rait/course/view.php?id=640">Network Security</a></li>
  <li><a href="/rait/course/view.php?id=815">Computer Networks</a></li>
  <li><a href="/rait/course/view.php?id=9">OK</a></li>
</ul></div>
</body></html>`
