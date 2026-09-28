export const GRADES_HTML = `<!doctype html><html><head><title>Course: Data Structures and Algorithms: View: User report</title></head><body>
<table class="generaltable user-grade">
<thead><tr><th>Grade item</th><th>Calculated weight</th><th>Grade</th><th>Range</th><th>Percentage</th><th>Feedback</th></tr></thead>
<tbody>
  <tr class="category"><td>Data Structures and Algorithms</td><td></td><td></td><td></td><td></td><td></td></tr>
  <tr><th>Assignment 1: Arrays</th><td>10 %</td><td>10.00</td><td>0–10</td><td>100.00 %</td><td></td></tr>
  <tr><th>Mid-semester exam</th><td>25 %</td><td>18.00</td><td>0–25</td><td>72.00 %</td><td>Good</td></tr>
  <tr><th>Assignment 3: Trees</th><td>10 %</td><td>-</td><td>0–10</td><td>-</td><td></td></tr>
  <tr><th>Course total</th><td>-</td><td>51.00</td><td>0–70</td><td>72.86 %</td><td></td></tr>
</tbody></table>
</body></html>`

export const GRADES_ERROR_HTML = `<!doctype html><html><head><title>Error</title></head><body>
<div class="box errorbox alert alert-danger">You are not enrolled in this course.</div>
</body></html>`
