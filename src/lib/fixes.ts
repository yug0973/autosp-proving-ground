/**
 * The code behind each finding the visitor can follow: the file, one sentence on what is wrong,
 * and the change AUTOSP proposes. All illustrative; the shapes are the usual ones for each class
 * of weakness in a Python web service.
 */
import type { FindingId } from './story';

export interface DiffLine {
  /** '-' removed, '+' added, ' ' unchanged context. */
  readonly kind: '-' | '+' | ' ';
  readonly text: string;
}

/** The test that reproduces a finding: it exploits the bug, so it fails on the code as it is. */
export interface ReproTest {
  readonly file: string;
  readonly name: string;
  readonly code: readonly string[];
  /** pytest's report of the failure: the assertion line and the error. */
  readonly failure: readonly string[];
}

export interface Fix {
  readonly id: FindingId;
  readonly name: string;
  readonly file: string;
  readonly problem: string;
  readonly diff: readonly DiffLine[];
  readonly test: ReproTest;
}

export const FIXES: Readonly<Record<FindingId, Fix>> = {
  'CWE-89': {
    id: 'CWE-89',
    name: 'SQL injection',
    file: 'app/repositories/invoices.py',
    problem: 'The invoice id goes straight into the SQL string, so a crafted id can rewrite the query.',
    diff: [
      { kind: ' ', text: 'def find_invoice(cur, invoice_id):' },
      { kind: '-', text: `    cur.execute("SELECT * FROM invoices WHERE id = '" + invoice_id + "'")` },
      { kind: '+', text: '    cur.execute("SELECT * FROM invoices WHERE id = %s", (invoice_id,))' },
      { kind: ' ', text: '    return cur.fetchone()' },
    ],
    test: {
      file: 'tests/test_invoices.py',
      name: 'test_invoice_id_cannot_change_the_query',
      code: [
        'def test_invoice_id_cannot_change_the_query(db):',
        `    row = find_invoice(db.cursor(), "1' OR '1'='1")`,
        '    assert row is None',
      ],
      failure: [
        '>       assert row is None',
        "E       AssertionError: assert (1, 'ACME Ltd', 1200.0) is None",
      ],
    },
  },
  'CWE-79': {
    id: 'CWE-79',
    name: 'Cross-site scripting',
    file: 'app/views/profile.py',
    problem:
      'The display name is written into the page as HTML, so a name containing a script runs in every visitor’s browser.',
    diff: [
      { kind: '+', text: 'from markupsafe import escape' },
      { kind: ' ', text: '' },
      { kind: ' ', text: 'def greeting(name):' },
      { kind: '-', text: '    return f"<h1>Hello {name}</h1>"' },
      { kind: '+', text: '    return f"<h1>Hello {escape(name)}</h1>"' },
    ],
    test: {
      file: 'tests/test_profile.py',
      name: 'test_display_name_is_escaped',
      code: [
        'def test_display_name_is_escaped():',
        '    html = greeting("<script>alert(1)</script>")',
        '    assert "<script>" not in html',
      ],
      failure: [
        '>       assert "<script>" not in html',
        "E       AssertionError: assert '<script>' not in '<h1>Hello <script>alert(1)</script></h1>'",
      ],
    },
  },
  'CWE-639': {
    id: 'CWE-639',
    name: 'Insecure direct object reference',
    file: 'app/api/orders.py',
    problem:
      'Any signed-in user can read any order by changing the number in the URL; nothing checks who owns it.',
    diff: [
      { kind: ' ', text: 'def get_order(order_id):' },
      { kind: '-', text: '    order = Order.query.get_or_404(order_id)' },
      { kind: '+', text: '    order = Order.query.filter_by(' },
      { kind: '+', text: '        id=order_id, owner_id=current_user.id' },
      { kind: '+', text: '    ).first_or_404()' },
      { kind: ' ', text: '    return jsonify(order.to_dict())' },
    ],
    test: {
      file: 'tests/test_orders.py',
      name: 'test_cannot_read_another_users_order',
      code: [
        'def test_cannot_read_another_users_order(client, alice, bobs_order):',
        '    client.login(alice)',
        '    response = client.get(f"/api/orders/{bobs_order.id}")',
        '    assert response.status_code == 404',
      ],
      failure: ['>       assert response.status_code == 404', 'E       AssertionError: assert 200 == 404'],
    },
  },
};
